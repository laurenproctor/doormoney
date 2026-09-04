"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { clearFlag, flagTarget, raiseFlag, type FlagSource } from "@/lib/flags";
import { supabaseAdmin } from "@/lib/supabase/server";

/*
  Raising and clearing a patron flag. The patron's side needs no account: the record id is an
  unguessable UUID, the same trust model as the record page itself. Nothing here moves money. It
  only stops money from moving, which is the safe direction.
*/

const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

const Raise = z.object({
  id: Id,
  note: z.string().trim().max(1000).optional(),
  /** Left empty by people, filled in by robots. */
  website: z.string().max(0).optional(),
});

export type FlagResult = { ok: true; paused: number; already: boolean } | { ok: false; error: string };

export async function raisePatronFlag(input: z.input<typeof Raise>): Promise<FlagResult> {
  const parsed = Raise.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That did not go through. Try once more." };
  const { id, note, website } = parsed.data;
  if (website) return { ok: false, error: "That did not go through." };

  const sb = supabaseAdmin();
  const target = await flagTarget(sb, id);
  if (!target) return { ok: false, error: "That record is not on Door Money." };

  try {
    const r = await raiseFlag(sb, target, note?.length ? note : null);
    revalidatePath(`/record/${id}`);
    revalidatePath(`/record/${id}/flag`);
    revalidatePath("/admin");
    return { ok: true, paused: r.paused, already: r.already };
  } catch (e) {
    console.error("raise flag failed", id, e instanceof Error ? e.message : e);
    return { ok: false, error: "That did not save. Try once more." };
  }
}

/** Door Money looked and the run is fine. Door Money staff only. */
export async function clearPatronFlag(source: FlagSource, id: string): Promise<{ ok: boolean; resumed?: number; error?: string }> {
  await requireAdmin();
  if (!Id.safeParse(id).success) return { ok: false, error: "Bad id." };
  try {
    const r = await clearFlag(supabaseAdmin(), source, id);
    revalidatePath("/admin");
    revalidatePath(`/record/${id}`);
    return { ok: true, resumed: r.resumed };
  } catch (e) {
    console.error("clear flag failed", id, e instanceof Error ? e.message : e);
    return { ok: false, error: "That did not save." };
  }
}
