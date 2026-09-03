"use server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";

/**
 * The act's yes or no on a patron's mark. Nothing publishes without the yes.
 * Ownership is checked through RLS on the read; the write goes through the
 * service role so the act never gets a general update policy on purchases.
 */
export async function decideMark(purchaseId: string, decision: "approved" | "declined"): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const sb = await supabaseServer();
  const { data: p } = await sb.from("purchases").select("id,mark_status").eq("id", purchaseId).maybeSingle();
  if (!p) return { ok: false, error: "That mark is not on this account's board." };
  if (p.mark_status !== "submitted") return { ok: false, error: "That mark has already been decided." };

  const { error } = await supabaseAdmin().from("purchases").update({ mark_status: decision }).eq("id", purchaseId).eq("mark_status", "submitted");
  if (error) return { ok: false, error: "That did not save. Try once more." };
  revalidatePath("/dashboard");
  return { ok: true };
}
