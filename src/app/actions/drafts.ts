"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { FundraiserDraftInput, DRAFT_COLUMNS, categoryErrors, type FundraiserCategory, type FundraiserDraft } from "@/lib/fundraiser-drafts";
import { detailValueErrors } from "@/lib/categories";
import { discoveryTagErrors, type DiscoveryRegistry } from "@/lib/discovery";
import { getDiscoveryRegistry } from "@/lib/discovery-registry";
import { slugify } from "@/lib/slug";
import { kitFitsCategory, starterKit } from "@/lib/starter-kits";

export type DraftState = { ok: boolean; error?: string; id?: string };

export async function draftCategories(): Promise<FundraiserCategory[]> {
  await requireUser("/dashboard");
  const sb = await supabaseServer();
  const { data, error } = await sb.from("fundraiser_categories").select("key,label,detail_keys,draft_enabled,publish_enabled").eq("draft_enabled", true).order("key");
  if (error) throw new Error("Category definitions could not be loaded.");
  return data as FundraiserCategory[];
}

/**
 * Whether a category may leave draft status, from the registry rather than from a list in code.
 *
 * Unknown categories and categories nobody has turned on answer false, so the safe reading is the
 * default one. Migration 0041 asks the same question again in the trigger.
 */
export async function categoryStatus(key: string): Promise<{ label: string; publishEnabled: boolean }> {
  await requireUser("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("fundraiser_categories").select("label,publish_enabled").eq("key", key).maybeSingle();
  return { label: data?.label ?? "Fundraiser", publishEnabled: data?.publish_enabled === true };
}

/**
 * The discovery facets and tags the draft form draws, from the registry (migration 0053).
 *
 * Behind an account, like the category list beside it: discovery data is only collected here. An
 * empty registry draws no discovery questions, which is what a database that cannot answer should
 * produce rather than questions whose answers would be refused.
 */
export async function draftDiscoveryRegistry(): Promise<DiscoveryRegistry> {
  await requireUser("/dashboard");
  return getDiscoveryRegistry(await supabaseServer());
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
  const sbForRegistry = await supabaseServer();
  const [categories, registry] = await Promise.all([draftCategories(), getDiscoveryRegistry(sbForRegistry)]);
  // A tag already on the row is not held to the registry's `active` flag: retiring a tag takes it
  // off the list for new choices and changes nothing already chosen (migration 0053).
  const previous = parsed.data.id
    ? ((await sbForRegistry.from("runs").select("discovery_tags").eq("id", parsed.data.id).eq("act_id", act.id).maybeSingle()).data?.discovery_tags as string[] | undefined) ?? []
    : [];
  const issues = [
    ...categoryErrors(parsed.data, categories),
    ...detailValueErrors(parsed.data.category_key, parsed.data.category_details, categories.find((c) => c.key === parsed.data.category_key)?.detail_keys ?? []),
    ...discoveryTagErrors(parsed.data.discovery_tags, registry, parsed.data.category_key, "fundraiser", previous),
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
    // One checkbox per tag, all under the same name. The registry decides which exist; the save
    // and then the database decide whether these may be chosen here.
    discovery_tags: form.getAll("discovery_tag").filter((v): v is string => typeof v === "string" && v.trim() !== ""),
    bidding_closes_at: value("bidding_closes_utc") ? `${value("bidding_closes_utc")}Z` : null,
    timezone: optional("timezone"), delivery_due_at: optional("delivery_due_at"),
    fundraising_starts_on: optional("fundraising_starts_on"), fundraising_ends_on: optional("fundraising_ends_on"),
    starts_on: optional("starts_on"), ends_on: optional("ends_on"), kind: optional("kind"),
    show_count: value("show_count"), expected_attendance: value("expected_attendance"),
  });
  if (result.ok && !value("id")) {
    // The starter kit is creation context and is not saved with the draft. It rides along in the
    // address for the pages after the first save, and only a real kit of this category is carried.
    const kit = starterKit(value("starter_kit"));
    const carried = kit && kitFitsCategory(kit, value("category_key")) ? `?kit=${kit.key}` : "";
    redirect(`/dashboard/runs/${result.id}${carried}`);
  }
  return result;
}
