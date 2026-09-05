"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { markApproved, markDeclined, markWaiting, sendEmail } from "@/lib/email";
import { markOpen, markSurface, markTarget } from "@/lib/marks";
import { ownerEmail } from "@/lib/purchases";
import { SITE } from "@/lib/site";
import { refundPurchase } from "@/lib/refunds";
import { stripeConfigured } from "@/lib/stripe";
import { actPath } from "@/lib/urls";

/**
 * The act's yes or no on a patron's mark. Nothing publishes without the yes.
 * A no refunds the patron in full (the placement never ran) and puts the spot back on the board.
 * Ownership is checked through RLS on the read; the writes go through the
 * service role so the act never gets a general update policy on purchases.
 */
export async function decideMark(purchaseId: string, decision: "approved" | "declined"): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: p } = await sb.from("purchases").select("id,mark_status,lot_id,payment_status").eq("id", purchaseId).maybeSingle();
  if (!p) return { ok: false, error: "That mark is not on this account's board." };
  if (p.mark_status !== "submitted") return { ok: false, error: "That mark has already been decided." };
  if (decision === "declined" && ["held", "released"].includes(p.payment_status) && !stripeConfigured()) {
    return { ok: false, error: "Declining refunds the patron, and refunds are not switched on yet. Contact Door Money." };
  }

  const admin = supabaseAdmin();
  let refundedCents: number | undefined;
  const { error } = await admin.from("purchases").update({ mark_status: decision }).eq("id", purchaseId).eq("mark_status", "submitted");
  if (error) return { ok: false, error: "That did not save. Try once more." };

  if (decision === "declined") {
    // The placement never runs, so the patron gets everything back and the spot goes back up.
    const r = await refundPurchase(admin, p.id, "mark_declined");
    if (!r.ok) return { ok: false, error: "The mark is declined, but the refund did not go through. Door Money has the details." };
    refundedCents = r.refundedCents;
    await admin.from("lots").update({ status: "open" }).eq("id", p.lot_id).eq("status", "sold");
    revalidatePath(actPath(act.slug));
  }

  // The patron hears the answer either way. A failed send is logged, never fatal: the decision stands.
  const target = await markTarget(purchaseId);
  const patronEmail = await patronAddress(admin, purchaseId);
  if (target && patronEmail) {
    const surface = markSurface(target);
    const mail =
      decision === "approved"
        ? markApproved({ to: patronEmail, patronName: target.patrons?.name ?? "A patron", actName: act.name, lotName: surface, recordUrl: `${SITE.url}/record/${purchaseId}` })
        : markDeclined({ to: patronEmail, patronName: target.patrons?.name ?? "A patron", actName: act.name, lotName: surface, refundedCents: refundedCents ?? 0, boardsUrl: `${SITE.url}/auctions` });
    const r = await sendEmail(mail);
    if (!r.sent) console.error("mark decision not sent", purchaseId, r.reason);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/mark/${purchaseId}`);
  return { ok: true };
}

/* ---------------------------------------------------------------------------------------------
   The patron's side. Whoever holds the link at /mark/<purchase id> can send the mark. No account
   is involved: the id is unguessable, and the worst a leaked link allows is sending a mark the act
   still has to approve.
   --------------------------------------------------------------------------------------------- */

export type MarkState = { ok: boolean; error?: string };

const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const MARK_MAX = 5 * 1024 * 1024;

const MarkInput = z.object({
  purchase_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "That link is not right."),
  mark_text: z.string().trim().max(80, "Keep the name under 80 characters."),
  mark_note: z.string().trim().max(300, "Keep the note under 300 characters."),
});

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

/**
 * The patron sends the mark: a logo file, a name to set, or both, plus an optional line to the act.
 * Sending again before the act decides replaces what is there.
 */
export async function submitMark(_prev: MarkState, form: FormData): Promise<MarkState> {
  const parsed = MarkInput.safeParse({
    purchase_id: str(form, "purchase_id"),
    mark_text: str(form, "mark_text"),
    mark_note: str(form, "mark_note"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That did not send." };
  const { purchase_id, mark_text, mark_note } = parsed.data;

  const file = form.get("mark_file");
  let upload: { bytes: ArrayBuffer; ext: string; type: string } | null = null;
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) return { ok: false, error: "Use a PNG, JPG or WebP." };
    if (file.size > MARK_MAX) return { ok: false, error: "Keep the file under 5MB." };
    upload = { bytes: await file.arrayBuffer(), ext, type: file.type };
  }

  const target = await markTarget(purchase_id);
  if (!target) return { ok: false, error: "That link is not right." };
  if (!markOpen(target)) {
    if (target.mark_status === "approved") return { ok: false, error: "That mark is already approved. Contact Door Money to change it." };
    if (target.mark_status === "declined") return { ok: false, error: "That placement was declined and refunded." };
    return { ok: false, error: "That run was cancelled." };
  }
  if (!upload && !mark_text && !target.mark_url) return { ok: false, error: "Add a logo file, a name, or both." };

  const admin = supabaseAdmin();
  let url = target.mark_url;
  if (upload) {
    const path = `${purchase_id}/${Date.now()}.${upload.ext}`;
    const { error: upErr } = await admin.storage.from("marks").upload(path, upload.bytes, { contentType: upload.type });
    if (upErr) {
      console.error("mark upload failed:", upErr.message);
      return { ok: false, error: "The file did not upload. Try once more." };
    }
    url = admin.storage.from("marks").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await admin
    .from("purchases")
    .update({ mark_url: url, mark_text: mark_text || null, mark_note: mark_note || null, mark_status: "submitted", mark_submitted_at: new Date().toISOString() })
    .eq("id", purchase_id)
    .in("mark_status", ["none", "submitted"]);
  if (error) {
    console.error("mark save failed:", error.message);
    return { ok: false, error: "That did not save. Try once more." };
  }

  // The act hears that something is waiting. A failed send is logged: the mark is saved either way.
  const owner = await actOwnerEmail(admin, purchase_id);
  if (owner) {
    const r = await sendEmail(
      markWaiting({
        to: owner,
        actName: target.lots.runs.acts.name,
        patronName: target.patrons?.name ?? "A patron",
        lotName: markSurface(target),
        note: mark_note || null,
        dashboardUrl: `${SITE.url}/dashboard`,
      }),
    );
    if (!r.sent) console.error("mark waiting notice not sent", purchase_id, r.reason);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/mark/${purchase_id}`);
  revalidatePath(`/record/${purchase_id}`);
  return { ok: true };
}

/** The email of the act that owns the board behind a purchase. */
async function actOwnerEmail(admin: ReturnType<typeof supabaseAdmin>, purchaseId: string) {
  const { data } = await admin.from("purchases").select("lots!inner(runs!inner(acts!inner(owner_id)))").eq("id", purchaseId).maybeSingle();
  const ownerId = (data as unknown as { lots: { runs: { acts: { owner_id: string | null } } } } | null)?.lots.runs.acts.owner_id ?? null;
  return ownerEmail(admin, ownerId);
}

/** The address that paid for a purchase. */
async function patronAddress(admin: ReturnType<typeof supabaseAdmin>, purchaseId: string) {
  const { data } = await admin.from("purchases").select("patrons(contact_email)").eq("id", purchaseId).maybeSingle();
  return (data as unknown as { patrons: { contact_email: string } | null } | null)?.patrons?.contact_email ?? null;
}
