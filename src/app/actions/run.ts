"use server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { cancelRun as cancelRunForReal } from "@/lib/refunds";
import { stripeConfigured } from "@/lib/stripe";
import { requireUser, ownedAct } from "@/lib/auth";
import { publishBlockers } from "@/lib/readiness";
import { slugify } from "@/lib/slug";
import { actPath, runPath } from "@/lib/urls";

export type RunField = "kind" | "title" | "starts_on" | "ends_on" | "show_count" | "expected_attendance" | "bidding_closes_at";
export type RunState = { ok: boolean; errors?: Partial<Record<RunField | "form", string>> };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const Input = z
  .object({
    kind: z.enum(["tour", "season", "residency"], { error: "Pick what kind of run this is." }),
    title: z.string().trim().min(2, "Give the fundraiser a name.").max(60, "Keep the name under 60 characters."),
    starts_on: dateStr,
    ends_on: dateStr,
    show_count: z.coerce.number().int("Whole shows only.").min(1, "At least one show.").max(400, "That is a lot of shows. Check the number."),
    expected_attendance: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? Number(v.replace(/[^0-9]/g, "")) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 10_000_000), "Enter a whole number."),
    bidding_closes_at: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? new Date(v) : null))
      .refine((v) => v === null || !Number.isNaN(v.getTime()), "Pick a date and time."),
  })
  .refine((r) => r.ends_on >= r.starts_on, { path: ["ends_on"], message: "It cannot end before it starts." })
  .refine((r) => !r.bidding_closes_at || r.bidding_closes_at.toISOString().slice(0, 10) <= r.ends_on, {
    path: ["bidding_closes_at"],
    message: "Bidding has to close by the last date.",
  });

/**
 * The two public pages a run change can leave stale: the act's page, which lists the runs, and the
 * run's own board. The word is read back rather than passed in, so this is right whichever action
 * calls it and whatever the caller had in hand.
 */
async function revalidateBoards(sb: SupabaseClient, actSlug: string, runId: string) {
  revalidatePath(actPath(actSlug));
  const { data } = await sb.from("runs").select("slug").eq("id", runId).maybeSingle();
  const runSlug = (data as { slug: string } | null)?.slug;
  if (runSlug) revalidatePath(runPath(actSlug, runSlug));
}

/**
 * The run's own word, taken from the name the musician gave it: "Europe Tour" becomes
 * "europe-tour" and the page is at /gutter-hymns/support-europe-tour.
 *
 * Unique inside the act, not across the site, so two acts may both run a "fall-tour". Migration
 * 0025 freezes the word once the run leaves draft, because by then it is a link somebody holds.
 */
async function runSlugFor(sb: SupabaseClient, actId: string, title: string, runId: string | null) {
  const base = slugify(title) || "run";
  const { data } = await sb.from("runs").select("id,slug").eq("act_id", actId);
  const taken = new Set(((data ?? []) as { id: string; slug: string }[]).filter((r) => r.id !== runId).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base.slice(0, 36)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, 32)}-${Date.now().toString(36).slice(-4)}`;
}

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/** Creates a draft run, or updates one the act owns. Sends the act on to price the lots. */
export async function saveRun(_prev: RunState, form: FormData): Promise<RunState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) redirect("/dashboard/act/new");

  const parsed = Input.safeParse({
    kind: str(form, "kind"),
    title: str(form, "title"),
    starts_on: str(form, "starts_on"),
    ends_on: str(form, "ends_on"),
    show_count: str(form, "show_count"),
    expected_attendance: str(form, "expected_attendance"),
    bidding_closes_at: str(form, "bidding_closes_at"),
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors as Partial<Record<RunField, string[]>>;
    const errors: RunState["errors"] = {};
    for (const k of Object.keys(f) as RunField[]) errors[k] = f[k]?.[0];
    return { ok: false, errors };
  }

  const sb = await supabaseServer();
  const row = {
    ...parsed.data,
    bidding_closes_at: parsed.data.bidding_closes_at?.toISOString() ?? null,
    act_id: act.id,
  };
  const runId = str(form, "id");

  if (runId) {
    // The id came from the form, so the act this account owns is part of the filter as well as
    // part of the row. A run belonging to somebody else matches nothing and changes nothing.
    //
    // A draft's address still follows its name. Once the run is published the name may still
    // change, but the address does not: it is a link on a poster by then, and 0025 refuses it.
    const { data: before } = await sb.from("runs").select("status").eq("id", runId).eq("act_id", act.id).maybeSingle();
    const draft = (before as { status: string } | null)?.status === "draft";
    const patch = draft ? { ...row, slug: await runSlugFor(sb, act.id, parsed.data.title, runId) } : row;
    const { error } = await sb.from("runs").update(patch).eq("id", runId).eq("act_id", act.id);
    if (error) return { ok: false, errors: { form: "That did not save. Try once more." } };
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/runs/${runId}`);
    await revalidateBoards(sb, act.slug, runId);
    return { ok: true };
  }

  const slug = await runSlugFor(sb, act.id, parsed.data.title, null);
  const { data, error } = await sb.from("runs").insert({ ...row, slug, status: "draft" }).select("id").single();
  if (error || !data) return { ok: false, errors: { form: "That did not save. Try once more." } };
  revalidatePath("/dashboard");
  redirect(`/dashboard/runs/${data.id}`);
}

/**
 * Draft to open: the board goes public.
 *
 * The rules live in src/lib/readiness.ts, so the checklist on the run page and the answer from this
 * button come from one place. Everything is read under the owner's session and filtered on the act
 * this account owns: the run id comes from the page, but no act id or owner id ever comes from the
 * client, and a run id belonging to somebody else matches no row.
 *
 * Payout setup is deliberately not on the list. Door Money holds every payment on the platform
 * balance and transfers weekly, so a board can open before Stripe is finished and the money waits.
 */
export async function publishRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: run } = await sb
    .from("runs")
    .select("id,status,title,starts_on,ends_on,show_count,bidding_closes_at,verification_methods,verification_other")
    .eq("id", runId)
    .eq("act_id", act.id)
    .maybeSingle();
  if (!run) return { ok: false, error: "That run is not on this account." };
  if (run.status !== "draft") return { ok: false, error: "That run is already published." };

  const { data: lots } = await sb.from("lots").select("id,mode").eq("run_id", runId);
  const all = lots ?? [];
  const blockers = publishBlockers({
    act,
    run: { ...run, methods: run.verification_methods ?? [], other: run.verification_other ?? null },
    lotCount: all.length,
    auctionCount: all.filter((l) => l.mode === "auction").length,
  });
  if (blockers.length) return { ok: false, error: blockers.join(" ") };

  // Conditional on the state it expects, so a second click cannot republish a run someone else took down.
  const { error } = await sb.from("runs").update({ status: "open" }).eq("id", runId).eq("act_id", act.id).eq("status", "draft");
  if (error) return { ok: false, error: "That did not publish. Try once more." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  await revalidateBoards(sb, act.slug, runId);
  revalidatePath("/auctions");
  return { ok: true };
}

/** Open back to draft, only while nothing has sold. */
export async function unpublishRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: sold } = await sb.from("lots").select("id").eq("run_id", runId).in("status", ["sold", "pending_funding"]).limit(1);
  if (sold && sold.length) return { ok: false, error: "A spot has sold, so the page stays up. Contact Door Money to cancel the fundraiser." };

  const { error } = await sb.from("runs").update({ status: "draft" }).eq("id", runId).eq("act_id", act.id).eq("status", "open");
  if (error) return { ok: false, error: "That did not save. Try once more." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  await revalidateBoards(sb, act.slug, runId);
  revalidatePath("/auctions");
  return { ok: true };
}

/**
 * The act pulls the run. Spots come off the board and every patron gets the unreleased part back.
 * Ownership is checked here; the money moves in src/lib/refunds.ts with the service role.
 */
export async function cancelRun(runId: string): Promise<{ ok: boolean; error?: string; refundedCents?: number; patrons?: number }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: run } = await sb.from("runs").select("id,status").eq("id", runId).eq("act_id", act.id).maybeSingle();
  if (!run) return { ok: false, error: "That run is not on this account." };
  if (!["open", "live"].includes(run.status)) return { ok: false, error: "Only an open or live run can be cancelled." };
  if (!stripeConfigured()) return { ok: false, error: "Refunds are not switched on yet. Contact Door Money to cancel the fundraiser." };

  const r = await cancelRunForReal(supabaseAdmin(), runId);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  await revalidateBoards(sb, act.slug, runId);
  revalidatePath("/auctions");
  return { ok: true, refundedCents: r.refundedCents, patrons: r.patrons, ...(r.errors.length ? { error: `${r.errors.length} refund${r.errors.length === 1 ? "" : "s"} did not go through. Door Money has the details.` } : {}) };
}
