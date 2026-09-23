"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { requireUser, ownedAct } from "@/lib/auth";
import { isEmptyOfferTerms, isExclusive, offerTermsFromForm, parseOfferTerms, sameOfferTerms, storedOfferTerms, type OfferTerms } from "@/lib/offer-terms";
import { publicLotProblem } from "@/lib/offer-readiness";
import { templatesForFundraiser, type OpportunityTemplate } from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";
import { actPath, runPath } from "@/lib/urls";

export type LotsState = { ok: boolean; error?: string; saved?: number };

const MIN_CENTS = 1_000; // $10
const MAX_CENTS = 10_000_000; // $100,000
const MAX_SPOTS = 6;

type Row = {
  key: string; on: boolean; count: number; priceCents: number; mode: "fixed" | "auction"; buyNowCents: number | null;
  /** The organizer's estimate of who this reaches, and why. Discovery metadata, not a term of sale. */
  reachEstimate: number | null; reachBasis: string | null;
  /** The offer contract: what the sponsor receives. Empty for an organizer who has written none. */
  terms: OfferTerms;
  /** The legacy half of the exclusivity section, kept in step with it on every save. */
  exclusive: boolean;
};

const MAX_REACH = 1_000_000_000;

/**
 * Reads the form against the templates this fundraiser may use, and no others. A field naming an
 * option from another category is never read, so it can never become a lot: the form is not what
 * decides which options exist. Migration 0044 refuses the same thing in the database.
 */
function parseRows(form: FormData, templates: readonly OpportunityTemplate[]): { rows: Row[]; error?: string } {
  const rows: Row[] = [];
  for (const s of templates) {
    const on = form.get(`on_${s.key}`) === "1";
    if (!on) {
      rows.push({ key: s.key, on: false, count: 0, priceCents: 0, mode: "fixed", buyNowCents: null, reachEstimate: null, reachBasis: null, terms: {}, exclusive: false });
      continue;
    }
    const dollars = String(form.get(`price_${s.key}`) ?? "").replace(/[^0-9.]/g, "");
    const priceCents = Math.round(Number(dollars) * 100);
    if (!Number.isFinite(priceCents) || priceCents < MIN_CENTS || priceCents > MAX_CENTS) {
      return { rows, error: `${s.name}: set a price between $10 and $100,000.` };
    }
    const mode = form.get(`mode_${s.key}`) === "auction" ? "auction" : "fixed";

    // Buy it now: optional, auctions only, and it has to be worth more than the reserve.
    const buyNowRaw = String(form.get(`buynow_${s.key}`) ?? "").replace(/[^0-9.]/g, "");
    let buyNowCents: number | null = null;
    if (mode === "auction" && buyNowRaw) {
      buyNowCents = Math.round(Number(buyNowRaw) * 100);
      if (!Number.isFinite(buyNowCents) || buyNowCents > MAX_CENTS) return { rows, error: `${s.name}: the take-it-now price has to be under $100,000.` };
      if (buyNowCents <= priceCents) return { rows, error: `${s.name}: the take-it-now price has to be above the reserve.` };
    }

    const count = Math.min(MAX_SPOTS, Math.max(1, Number(form.get(`count_${s.key}`) ?? 1) || 1));

    // An expected reach is optional. A number without its basis is not: the product contract says
    // an estimate states what it rests on, and migration 0053 refuses the pair any other way.
    // A basis with no number is kept, so somebody part way through typing loses nothing.
    const reachRaw = String(form.get(`reach_${s.key}`) ?? "").replace(/[^0-9]/g, "");
    const reachBasis = String(form.get(`reachbasis_${s.key}`) ?? "").trim() || null;
    let reachEstimate: number | null = null;
    if (reachRaw) {
      reachEstimate = Number(reachRaw);
      if (!Number.isFinite(reachEstimate) || reachEstimate > MAX_REACH) {
        return { rows, error: `${s.name}: that is more people than the estimate can hold.` };
      }
      if (!reachBasis || reachBasis.length < 3) {
        return { rows, error: `${s.name}: say where the expected reach comes from, or leave the number out.` };
      }
    }

    // The offer contract. Additive: an organizer who fills none of it in saves exactly the spot
    // they saved before this existed, and one who fills part of it keeps the part they wrote.
    const terms = parseOfferTerms(offerTermsFromForm(form, s.key));
    if (!terms.ok) return { rows, error: `${s.name}: ${terms.error}` };

    rows.push({ key: s.key, on: true, count, priceCents, mode, buyNowCents, reachEstimate, reachBasis, terms: terms.terms, exclusive: isExclusive(terms.terms) });
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
  const { data: run } = await sb.from("runs").select("id,slug,status,category_key").eq("id", runId).eq("act_id", act.id).maybeSingle();
  if (!run) return { ok: false, error: "That run is not on this account." };

  const { data: existing } = await sb.from("lots").select("id,surface_key,label,price_cents,mode,status,buy_now_cents,reach_estimate,reach_basis,offer_terms,exclusive,terms_grandfathered").eq("run_id", runId).order("created_at");
  const current = existing ?? [];

  // The category is the fundraiser's, read from the row the session owns, never from the form.
  // What may be newly offered is that category's active templates (music narrowed by act type).
  // A template this fundraiser already has spots on stays editable even if it has since been
  // retired or the act type moved, so an existing sponsorship is never stranded by a save.
  const categoryKey = run.category_key ?? "music";
  const registry = await loadTemplates(sb, categoryKey);
  const offered = templatesForFundraiser(registry, categoryKey, act.type);
  const offeredKeys = new Set(offered.map((t) => t.key));
  const inUse = registry.filter((t) => !offeredKeys.has(t.key) && current.some((l) => l.surface_key === t.key));
  const everything = [...offered, ...inUse];

  // One option at a time, where the form asks for it (`only`). The sponsorships stage builds one
  // option and posts only its fields, so reading the whole form as the whole fundraiser would take
  // every other option as switched off and delete its open spots. A scoped save touches one
  // template's spots and no other row. The key still has to be one this fundraiser may offer.
  const only = form.get("only");
  const templates = typeof only === "string" && only ? everything.filter((t) => t.key === only) : everything;
  if (typeof only === "string" && only && templates.length === 0) return { ok: false, error: "That option is not one this fundraiser can offer." };

  const { rows, error } = parseRows(form, templates);
  if (error) return { ok: false, error };

  /**
   * On a public fundraiser every spot written has to carry complete offer terms, unless it is
   * grandfathered (0060) or carries the document of a sold or bid-on sibling (0061). The database
   * refuses the write either way; this asks first, so the answer names what is missing. A private
   * draft is not asked: a partial option saves there exactly as before.
   */
  const isPublic = run.status === "open" || run.status === "live";
  if (isPublic) {
    for (const r of rows) {
      if (!r.on) continue;
      const s = templates.find((t) => t.key === r.key)!;
      const mine = current.filter((l) => l.surface_key === r.key);
      const frozen = mine.find((l) => l.status !== "open");
      const terms = frozen ? storedOfferTerms(frozen) : r.terms;
      const open = mine.filter((l) => l.status === "open");
      const willWrite = [
        ...open.map((l) => ({ id: l.id, terms_grandfathered: l.terms_grandfathered === true })),
        ...Array.from({ length: Math.max(0, r.count - mine.length) }, () => ({ id: null, terms_grandfathered: false })),
      ];
      for (const w of willWrite) {
        const problem = publicLotProblem({ surface_key: r.key, id: w.id, terms, reach_estimate: r.reachEstimate, reach_basis: r.reachBasis, terms_grandfathered: w.terms_grandfathered }, current);
        if (problem) {
          return { ok: false, error: `${s.name}: this fundraiser is public, so its offer terms have to be complete before they are saved. Still missing: ${problem.map((m) => m.charAt(0).toLowerCase() + m.slice(1)).join("; ")}. Take the fundraiser down to save a partial option.` };
        }
      }
    }
  }

  type Discovery = { reach_estimate: number | null; reach_basis: string | null };
  /**
   * The offer contract, where the organizer wrote one.
   *
   * Sent only when there is something to send, and on an update only when it actually changed. Two
   * reasons, and both matter. A lot nobody has written terms for keeps the row it has, so this
   * changes nothing about the spots that already exist; and migration 0035's freeze compares the
   * values it is handed, so a price change on a spot with a bid on it is still refused for the
   * price and never for a document that did not move.
   */
  type Terms = { offer_terms?: OfferTerms; exclusive?: boolean };
  /**
   * A new spot is inserted without its status. The column defaults to `open`, and migration 0022's
   * column-level grant does not include it, so naming it, as this did until 2026-09-23, made
   * Postgres refuse every new spot an organizer added from the dashboard with "permission denied
   * for table lots". Its lifecycle is the auction and payment code's to write, as the service role.
   */
  const inserts: ({ run_id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; buy_now_cents: number | null } & Discovery & Terms)[] = [];
  const updates: ({ id: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; buy_now_cents: number | null } & Discovery & Terms)[] = [];
  const deletes: string[] = [];

  /**
   * The offer contract this save should apply to one template's spots.
   *
   * Normally what the form carried. Not so once a spot on the template has sold or has a bid on
   * it: the editor locks the whole row then, and a locked field is disabled, and a disabled control
   * is never submitted. The form would arrive carrying an empty document, and taking it at face
   * value would wipe the terms off the template's still-open spots and clear their exclusivity.
   *
   * So when the row is locked the terms are read back off the spot that locked it, which is the
   * copy the database has frozen (migration 0035, widened in 0056) and the copy the sponsor bought.
   * A new spot added to a locked template gets the same document rather than an empty one, and an
   * open sibling that has somehow drifted is brought back to it.
   *
   * Server-side on purpose. The editor disables those fields as a courtesy; this is the rule.
   */
  const termsFor = (mine: readonly { status: string; offer_terms?: unknown; exclusive?: boolean | null }[], r: Row): { terms: OfferTerms; exclusive: boolean } => {
    const frozen = mine.find((l) => l.status !== "open");
    if (!frozen) return { terms: r.terms, exclusive: r.exclusive };
    return { terms: storedOfferTerms(frozen), exclusive: frozen.exclusive ?? false };
  };

  /** What an existing lot's terms columns have to become, or nothing where they already say it. */
  const termsChange = (lot: { offer_terms?: unknown; exclusive?: boolean | null }, want: { terms: OfferTerms; exclusive: boolean }): Terms => ({
    ...(sameOfferTerms(storedOfferTerms(lot), want.terms) ? {} : { offer_terms: want.terms }),
    ...(want.exclusive === (lot.exclusive ?? false) ? {} : { exclusive: want.exclusive }),
  });
  /** The same for a spot that does not exist yet: the column defaults say the rest. */
  const termsNew = (want: { terms: OfferTerms; exclusive: boolean }): Terms => ({
    ...(isEmptyOfferTerms(want.terms) ? {} : { offer_terms: want.terms }),
    ...(want.exclusive ? { exclusive: true } : {}),
  });

  for (const r of rows) {
    const s = templates.find((t) => t.key === r.key)!;
    const mine = current.filter((l) => l.surface_key === r.key);
    const locked = mine.filter((l) => l.status !== "open");
    const open = mine.filter((l) => l.status === "open");
    const want = r.on ? Math.max(r.count, locked.length) : locked.length;
    const total = want;
    const terms = termsFor(mine, r);

    // Keep locked lots as they are, reuse open ones, then add or drop to reach the count.
    const keepOpen = open.slice(0, Math.max(0, total - locked.length));
    const dropOpen = open.slice(keepOpen.length);
    deletes.push(...dropOpen.map((l) => l.id));

    let n = locked.length;
    for (const l of keepOpen) {
      n += 1;
      updates.push({ id: l.id, label: total > 1 ? `${s.name} spot ${n}` : null, price_cents: r.priceCents, mode: r.mode, buy_now_cents: r.buyNowCents, reach_estimate: r.reachEstimate, reach_basis: r.reachBasis, ...termsChange(l, terms) });
    }
    for (; n < total; n += 1) {
      inserts.push({ run_id: runId, surface_key: r.key, label: total > 1 ? `${s.name} spot ${n + 1}` : null, price_cents: r.priceCents, mode: r.mode, buy_now_cents: r.buyNowCents, reach_estimate: r.reachEstimate, reach_basis: r.reachBasis, ...termsNew(terms) });
    }
  }

  if (deletes.length) {
    const { error: e } = await sb.from("lots").delete().in("id", deletes).eq("status", "open");
    if (e?.message.includes("cannot be deleted")) return { ok: false, error: "A spot with a bid or a payment on it cannot be removed." };
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }
  for (const u of updates) {
    const { id: _id, ...columns } = u;
    void _id;
    const { error: e } = await sb.from("lots").update(columns).eq("id", u.id).eq("status", "open");
    // Migration 0035 freezes a spot's terms the moment somebody bids on it, and 0056 counts the
    // offer contract among them: a sponsor who bid on an offer bid on the one they read.
    if (e?.message.includes("lot_terms_frozen")) return { ok: false, error: `${u.label ?? "A spot"} already has a bid on it, so its price, its mode, its take-it-now number and the terms of its offer stay as they are.` };
    if (e?.message.includes("lots_offer_terms_is_sponsor_facing")) return { ok: false, error: `${u.label ?? "A spot"}: those offer terms are too long, or hold something that belongs on the delivery record rather than in the offer.` };
    if (e?.message.includes("needs complete offer terms")) return { ok: false, error: `${u.label ?? "A spot"}: this fundraiser is public, so an option on it keeps complete offer terms. Take the fundraiser down to save a partial one.` };
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }
  if (inserts.length) {
    const { error: e } = await sb.from("lots").insert(inserts);
    // Migration 0044. Neither should be reachable from the editor; both are said in words if they are.
    if (e?.message.includes("opportunity_category_mismatch")) return { ok: false, error: "One of those options belongs to a different category than this fundraiser, so nothing new was added." };
    if (e?.message.includes("sponsorship_option_retired")) return { ok: false, error: "One of those options is no longer offered for new sponsorships. The spots you already have on it are unchanged." };
    if (e?.message.includes("lots_offer_terms_is_sponsor_facing")) return { ok: false, error: "Those offer terms are too long, or hold something that belongs on the delivery record rather than in the offer." };
    if (e?.message.includes("needs complete offer terms")) return { ok: false, error: "This fundraiser is public, so a new option on it needs complete offer terms before it is saved. Take the fundraiser down to save a partial one." };
    if (e) return { ok: false, error: "Some spots did not save. Try once more." };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/runs/${runId}`);
  revalidatePath(actPath(act.slug));
  revalidatePath(runPath(act.slug, run.slug));
  revalidatePath("/fundraisers");
  return { ok: true, saved: updates.length + inserts.length };
}
