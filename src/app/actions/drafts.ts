"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FundraiserDraftInput, DRAFT_COLUMNS, categoryErrors, type FundraiserCategory, type FundraiserDraft } from "@/lib/fundraiser-drafts";
import { detailValueErrors } from "@/lib/categories";
import { slugify } from "@/lib/slug";

export type DraftState = { ok: boolean; error?: string; id?: string };

export async function draftCategories(): Promise<FundraiserCategory[]> {
  await requireUser("/dashboard");
  const sb = await supabaseServer();
  const { data, error } = await sb.from("fundraiser_categories").select("key,label,detail_keys,draft_enabled").eq("draft_enabled", true).order("key");
  if (error) throw new Error("Category definitions could not be loaded.");
  return data as FundraiserCategory[];
}

export async function loadFundraiserDraft(id: string): Promise<FundraiserDraft | null> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sb = await supabaseServer();
  const { data, error } = await sb.from("runs").select(DRAFT_COLUMNS).eq("id", id).eq("act_id", act.id).eq("status", "draft").maybeSingle();
  if (error) throw new Error("The draft could not be loaded.");
  return data as FundraiserDraft | null;
}

/** A full draft save. Ownership, status, and financial columns never come from the caller. */
export async function saveFundraiserDraft(input: unknown): Promise<DraftState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "Create your organizer profile first." };
  const parsed = FundraiserDraftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" ") };
  const categories = await draftCategories();
  const issues = [
    ...categoryErrors(parsed.data, categories),
    ...detailValueErrors(parsed.data.category_key, parsed.data.category_details, categories.find((c) => c.key === parsed.data.category_key)?.detail_keys ?? []),
  ];
  if (issues.length) return { ok: false, error: issues.join(" ") };
  const sb = await supabaseServer();
  const { id, ...fields } = parsed.data;
  const targetId = id ?? randomUUID();
  // Preserve the address when editing. New draft addresses are unique even for unnamed drafts.
  const row = id ? fields : { ...fields, act_id: act.id, status: "draft", slug: `${slugify(fields.title).slice(0, 27) || "fundraiser"}-${targetId.slice(0, 8)}` };
  const result = id
    ? await sb.from("runs").update(row).eq("id", id).eq("act_id", act.id).eq("status", "draft").select("id").maybeSingle()
    : await sb.from("runs").insert(row).select("id").single();
  if (result.error || !result.data) return { ok: false, error: "The draft did not save. Check that it is still a draft on your account and that its category can change." };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${result.data.id}`);
  return { ok: true, id: result.data.id };
}

export async function saveDraftForm(_previous: DraftState, form: FormData): Promise<DraftState> {
  const value = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)) : "";
  const optional = (key: string) => value(key) || null;
  // Each category detail arrives as its own field, named for the key it is stored under. Empty
  // answers are left out rather than stored as blanks: an unknown detail is absent, not "".
  const category_details: Record<string, string> = {};
  for (const [key, field] of form.entries()) {
    if (key.startsWith("detail_") && typeof field === "string" && field.trim()) category_details[key.slice(7)] = field.trim();
  }
  let activity_locations: unknown;
  try {
    activity_locations = JSON.parse(value("activity_locations") || "[]");
  } catch { return { ok: false, error: "The draft details could not be read. Reload and try again." }; }
  const result = await saveFundraiserDraft({
    ...(value("id") ? { id: value("id") } : {}),
    category_key: value("category_key"), title: value("title"), purpose: value("purpose"),
    description: value("description"), audience_description: value("audience_description"), sponsor_promise: value("sponsor_promise"),
    goal_cents: value("goal_amount") === "" ? null : /^\d+(?:\.\d{1,2})?$/.test(value("goal_amount")) ? Number(value("goal_amount").split(".")[0]) * 100 + Number((value("goal_amount").split(".")[1] || "").padEnd(2, "0")) : "invalid", goal_currency: optional("goal_currency"),
    activity_mode: optional("activity_mode"), activity_locations, category_details,
    bidding_closes_at: value("bidding_closes_utc") ? `${value("bidding_closes_utc")}Z` : null,
    timezone: optional("timezone"), delivery_due_at: optional("delivery_due_at"),
    fundraising_starts_on: optional("fundraising_starts_on"), fundraising_ends_on: optional("fundraising_ends_on"),
    starts_on: optional("starts_on"), ends_on: optional("ends_on"), kind: optional("kind"),
    show_count: value("show_count"), expected_attendance: value("expected_attendance"),
  });
  if (result.ok && !value("id")) redirect(`/dashboard/runs/${result.id}`);
  return result;
}
