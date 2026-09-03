"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { CATALOG } from "@/lib/catalog";

export type LotsState = { ok: boolean; error?: string; saved?: number };

const MIN_CENTS = 1_000; // $10
const MAX_CENTS = 10_000_000; // $100,000
const MAX_SPOTS = 6;

type Row = { key: string; on: boolean; count: number; priceCents: number; mode: "fixed" | "auction" };

function parseRows(form: FormData): { rows: Row[]; error?: string } {
  const rows: Row[] = [];
  for (const s of CATALOG) {
    const on = form.get(`on_${s.key}`) === "1";
    if (!on) {
      rows.push({ key: s.key, on: false, count: 0, priceCents: 0, mode: "fixed" });
      continue;
    }
    const dollars = String(form.get(`price_${s.key}`) ?? "").replace(/[^0-9.]/g, "");
    const priceCents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents < MIN_CENTS || priceCents > MAX_CENTS) {
      return { rows, error: `${s.name}: set a price between $10 and $100,000.` };
    }
    const mode = form.get(`mode_${s.key}`) === "auction" ? "auction" : "fixed";
    const count = Math.min(MAX_SPOTS, Math.max(1, Number(form.get(`count_${s.key}`) ?? 1) || 1));
    rows.push({ key: s.key, on: true, count, priceCents, mode });
  }
  return { rows };
}

/**
 * Saves the run's lots to match the form: one lot per spot, labelled "Name spot n" when a
 * surface has more than one. Spots that already sold are never touched or removed.
 */
export async function saveLots(_prev: LotsState, form: FormData): Promise<LotsState> {
  const user = await requireUser("/dashboard");
  const act = await ownedAct(user.id);
  if (!act) return { ok: false, error: "No act on this account." };

  const runId = String(form.get("run_id") ?? "");
  const sb = await supabaseServer();
  const { data: run } = await sb.from("runs").select("id,status").eq("id", runId).eq("act_id", act.id).maybeSingle();
  if (!run) return { ok: false, error: "That run is not on this account." };

  const { rows, error } = parseRows(form);
  if (error) return { ok: false, error };

  const { data: existing } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status").eq("run_id", runId).order("created_at");
  const current = existing ?? [];

  const inserts: { run_id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; status: "open" }[] = [];
  const updates: { id: string; label: string | null; price_cents: number; mode: "fixed" | "auction" }[] = [];
  const deletes: string[] = [];

  for (const r of rows) {
    const s = CATALOG.find((c) => c.key === r.key)!;
    const mine = current.filter((l) => l.surface_key === r.key);
    const locked = mine.filter((l) => l.status !== "open");
    const open = mine.filter((l) => l.status === "open");
    const want = r.on ? Math.max(r.count, locked.length) : locked.length;
    const total = want;

    // Keep locked lots as they are, reuse open ones, then add or drop to reach the count.
    const keepOpen = open.slice(0, Math.max(0, total - locked.length));
    const dropOpen = open.slice(keepOpen.length);
    deletes.push(...dropOpen.map((l) => l.id));

    let n = locked.length;
    for (const l of keepOpen) {
      n += 1;
      updates.push({ id: l.id, label: total > 1 ? `${s.name} spot ${n}` : null, price_cents: r.priceCents, mode: r.mode });
    }
    for (; n < total; n += 1) {
      inserts.push({ run_id: runId, surface_key: r.key, label: total > 1 ? `${s.name} spot ${n + 1}` : null, price_cents: r.priceCents, mode: r.mode, status: "open" });
    }
  }

  if (deletes.length) {
    const { error: e } = await sb.from("lots").delete().in("id", deletes).eq("status", "open");
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }
  for (const u of updates) {
    const { error: e } = await sb.from("lots").update({ label: u.label, price_cents: u.price_cents, mode: u.mode }).eq("id", u.id).eq("status", "open");
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }
  if (inserts.length) {
    const { error: e } = await sb.from("lots").insert(inserts);
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(`/board/${act.slug}`);
  revalidatePath("/auctions");
  return { ok: true, saved: updates.length + inserts.length };
}
