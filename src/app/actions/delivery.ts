"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { ownedAct, requireUser } from "@/lib/auth";
import { setEvidenceVisibility, submitEvidence } from "@/lib/delivery";
import { EVIDENCE_KINDS } from "@/lib/delivery-policy";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  The organizer's side of delivery: documenting a deliverable, and choosing whether one evidence
  item is public.

  Both authenticate first and both authorize the row against the signed-in organizer, never against
  anything the form said. The writes go through the service role because deliverables and evidence
  carry no browser write grant at all (migration 0045), the way patron_profiles does not.
*/

export type DeliveryState = { ok: boolean; message?: string; error?: string };

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

const Evidence = z.object({
  deliverableId: Id,
  kind: z.enum(EVIDENCE_KINDS),
  url: z.string().trim().max(500).optional(),
  note: z.string().trim().max(2000).optional(),
  showsMinor: z.boolean(),
});

/** Whether this deliverable sits on a fundraiser the signed-in account organizes. */
async function organizerOwns(actId: string, deliverableId: string): Promise<boolean> {
  const { data } = await supabaseAdmin()
    .from("deliverables")
    .select("id,purchases!inner(lots!inner(runs!inner(act_id)))")
    .eq("id", deliverableId)
    .maybeSingle();
  const row = data as unknown as { purchases: { lots: { runs: { act_id: string } } } } | null;
  return row?.purchases.lots.runs.act_id === actId;
}

/** Documents one deliverable. Always stored private: publishing an item is its own, separate step. */
export async function submitEvidenceAction(_prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No organizer profile on this account." };

  const parsed = Evidence.safeParse({
    deliverableId: str(form, "deliverable_id"),
    kind: str(form, "kind"),
    url: str(form, "url") || undefined,
    note: str(form, "note") || undefined,
    showsMinor: form.get("shows_minor") === "1",
  });
  if (!parsed.success) return { ok: false, error: "Check the link and the note, and try once more." };
  if (!(await organizerOwns(act.id, parsed.data.deliverableId))) return { ok: false, error: "That deliverable is not on this account." };

  const r = await submitEvidence(supabaseAdmin(), {
    deliverableId: parsed.data.deliverableId,
    submittedBy: user.id,
    evidence: { kind: parsed.data.kind, url: parsed.data.url, note: parsed.data.note, showsMinor: parsed.data.showsMinor, visibility: "private" },
  });
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/dashboard");
  return { ok: true, message: r.released ? "Saved. Your share for this is set for the next Friday, once the sponsor's materials are accepted." : "Saved." };
}

const Visibility = z.object({ evidenceId: Id, visibility: z.enum(["private", "public"]) });

/** Publishes one evidence item, or takes it back. Nothing else becomes public with it. */
export async function setEvidenceVisibilityAction(_prev: DeliveryState, form: FormData): Promise<DeliveryState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No organizer profile on this account." };
  const parsed = Visibility.safeParse({ evidenceId: str(form, "evidence_id"), visibility: str(form, "visibility") });
  if (!parsed.success) return { ok: false, error: "That did not save. Try once more." };

  const { data } = await supabaseAdmin().from("evidence").select("deliverable_id").eq("id", parsed.data.evidenceId).maybeSingle();
  const deliverableId = (data as { deliverable_id: string } | null)?.deliverable_id;
  if (!deliverableId || !(await organizerOwns(act.id, deliverableId))) return { ok: false, error: "That item is not on this account." };

  const r = await setEvidenceVisibility(supabaseAdmin(), parsed.data.evidenceId, parsed.data.visibility);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath("/dashboard");
  return { ok: true, message: parsed.data.visibility === "public" ? "That item is public. Nothing else on the record is." : "That item is private again." };
}
