"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";

export type RunField = "kind" | "title" | "starts_on" | "ends_on" | "show_count" | "expected_attendance" | "bidding_closes_at";
export type RunState = { ok: boolean; errors?: Partial<Record<RunField | "form", string>> };

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const Input = z
  .object({
    kind: z.enum(["tour", "season", "residency"], { error: "Pick what kind of run this is." }),
    title: z.string().trim().min(2, "Give the run a name.").max(60, "Keep the name under 60 characters."),
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
  .refine((r) => r.ends_on >= r.starts_on, { path: ["ends_on"], message: "The run cannot end before it starts." })
  .refine((r) => !r.bidding_closes_at || r.bidding_closes_at.toISOString().slice(0, 10) <= r.ends_on, {
    path: ["bidding_closes_at"],
    message: "Bidding has to close by the end of the run.",
  });

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
    const { error } = await sb.from("runs").update(row).eq("id", runId);
    if (error) return { ok: false, errors: { form: "That did not save. Try once more." } };
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/runs/${runId}`);
    revalidatePath(`/board/${act.slug}`);
    return { ok: true };
  }

  const { data, error } = await sb.from("runs").insert({ ...row, status: "draft" }).select("id").single();
  if (error || !data) return { ok: false, errors: { form: "That did not save. Try once more." } };
  revalidatePath("/dashboard");
  redirect(`/dashboard/runs/${data.id}`);
}

/** Draft to open: the board goes public. Needs at least one lot, and a close time if any lot is an auction. */
export async function publishRun(runId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: run } = await sb.from("runs").select("id,status,bidding_closes_at").eq("id", runId).eq("act_id", act.id).maybeSingle();
  if (!run) return { ok: false, error: "That run is not on this account." };
  if (run.status !== "draft") return { ok: false, error: "That run is already published." };

  const { data: lots } = await sb.from("lots").select("id,mode").eq("run_id", runId);
  if (!lots || lots.length === 0) return { ok: false, error: "Add at least one spot before publishing." };
  if (lots.some((l) => l.mode === "auction") && !run.bidding_closes_at) {
    return { ok: false, error: "Auction spots need a bidding close time. Set one on the run." };
  }

  const { error } = await sb.from("runs").update({ status: "open" }).eq("id", runId);
  if (error) return { ok: false, error: "That did not publish. Try once more." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(`/board/${act.slug}`);
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
  if (sold && sold.length) return { ok: false, error: "A spot has sold, so the board stays up. Contact Door Money to cancel the run." };

  const { error } = await sb.from("runs").update({ status: "draft" }).eq("id", runId).eq("act_id", act.id).eq("status", "open");
  if (error) return { ok: false, error: "That did not save. Try once more." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(`/board/${act.slug}`);
  revalidatePath("/auctions");
  return { ok: true };
}
