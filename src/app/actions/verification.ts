"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { parseVerification, type VerificationField } from "@/lib/verification";

export type VerificationState = {
  ok: boolean;
  errors?: Partial<Record<VerificationField, string>>;
  /** How many methods the save left on the run, for the note beside the button. */
  saved?: number;
};

/**
 * Saves the verification promise on one run.
 *
 * The run id arrives from the form, so it is never trusted: the act comes from the session, and
 * the update is filtered on that act's id as well as the run's. A run id belonging to somebody
 * else matches no row and changes nothing. No act id or owner id is read from the form at all.
 */
export async function saveVerification(_prev: VerificationState, form: FormData): Promise<VerificationState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, errors: { form: "No act on this account." } };

  const runId = form.get("run_id");
  if (typeof runId !== "string" || !runId) return { ok: false, errors: { form: "That run is not on this account." } };

  const sb = await supabaseServer();
  const { data: run } = await sb.from("runs").select("id,status").eq("id", runId).eq("act_id", act.id).maybeSingle();
  if (!run) return { ok: false, errors: { form: "That run is not on this account." } };

  const parsed = parseVerification({ methods: form.getAll("methods").filter((v) => typeof v === "string"), other: form.get("other") });
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  // A draft may sit with nothing chosen; a board already on the internet may not go back to nothing.
  if (parsed.value.methods.length === 0 && run.status !== "draft") {
    return { ok: false, errors: { methods: "This board is public, so it needs at least one method. Pick one before saving." } };
  }

  const { error } = await sb
    .from("runs")
    .update({ verification_methods: parsed.value.methods, verification_other: parsed.value.other })
    .eq("id", runId)
    .eq("act_id", act.id);
  if (error) return { ok: false, errors: { form: "That did not save. Try once more." } };

  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(`/dashboard/runs/${runId}/preview`);
  revalidatePath("/dashboard");
  revalidatePath(`/board/${act.slug}`);
  return { ok: true, saved: parsed.value.methods.length };
}
