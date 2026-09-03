"use server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { refundPurchase } from "@/lib/refunds";
import { stripeConfigured } from "@/lib/stripe";

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
  const { error } = await admin.from("purchases").update({ mark_status: decision }).eq("id", purchaseId).eq("mark_status", "submitted");
  if (error) return { ok: false, error: "That did not save. Try once more." };

  if (decision === "declined") {
    // The placement never runs, so the patron gets everything back and the spot goes back up.
    const r = await refundPurchase(admin, p.id, "mark_declined");
    if (!r.ok) return { ok: false, error: "The mark is declined, but the refund did not go through. Door Money has the details." };
    await admin.from("lots").update({ status: "open" }).eq("id", p.lot_id).eq("status", "sold");
    revalidatePath(`/board/${act.slug}`);
  }
  revalidatePath("/dashboard");
  return { ok: true };
}
