/**
 * The review stage, in arithmetic: what is unfinished and where it is fixed, which words are
 * still a starter idea's example, and what publishing would make public.
 *
 * Readiness is decided once, in src/lib/readiness.ts, which `publishRun` runs; this file never
 * decides it again. It only reads the rows that function produces and says, for each one that is
 * not done, which stage of the journey it is fixed on, because the checklist's own hrefs point at
 * the published fundraiser's workspace and a draft no longer has one.
 *
 * Pure: nothing here reads the database.
 */
import { stagePath, stageMissing, type JourneyStage } from "@/lib/fundraiser-stages";
import type { ReadinessRow } from "@/lib/readiness";
import { starterKit, KIT_TEXT_FIELDS, type KitTextField } from "@/lib/starter-kits";

export type UnfinishedItem = { key: ReadinessRow["key"]; label: string; note: string; href: string; where: string };

type ReviewRun = {
  id: string;
  category_key?: string | null;
  title: string | null;
  purpose: string | null;
  audience_description: string | null;
  sponsor_promise: string | null;
  starts_on: string | null;
  ends_on: string | null;
  show_count: number | null;
};

/**
 * The rows still to do, each with the way to it. Payouts is left out: it is optional and the
 * checklist already says so. The publish row is the sum of the others and is not an item.
 */
export function unfinishedItems(rows: readonly ReadinessRow[], run: ReviewRun, kit: string | null): UnfinishedItem[] {
  const out: UnfinishedItem[] = [];
  for (const row of rows) {
    if (row.done || row.optional || row.key === "publish") continue;
    const to = whereToFix(row.key, run, kit);
    out.push({ key: row.key, label: row.label, note: row.note, href: to.href, where: to.where });
  }
  return out;
}

function whereToFix(key: ReadinessRow["key"], run: ReviewRun, kit: string | null): { href: string; where: string } {
  switch (key) {
    case "profile":
      return { href: "/dashboard/act", where: "the organizer page" };
    case "run": {
      // The funding stage holds what the funding enables, what a sponsor can count on, and music's
      // dates and count; the project stage holds the name and the audience.
      const stage: JourneyStage = stageMissing(run, "project").length > 0 ? "project" : "funding";
      return { href: stagePath(run.id, stage, kit), where: `the ${stage} stage` };
    }
    case "lots":
      return { href: stagePath(run.id, "sponsorships", kit), where: "the sponsorships stage" };
    case "verification":
      return { href: "#verification", where: "this page, below" };
    default:
      return { href: stagePath(run.id, "review", kit), where: "this page" };
  }
}

/**
 * The fields still holding a starter idea's example wording, word for word.
 *
 * Known only while the address still carries the kit (`?kit=`), because the kit is creation
 * context and is stored nowhere. An organizer who saved the example unchanged has saved words that
 * are theirs now; this only says so, so they can decide whether they mean them.
 */
export function exampleFields(draft: Partial<Record<KitTextField, string | null>>, kitKey: string | null): KitTextField[] {
  const kit = starterKit(kitKey);
  if (!kit) return [];
  return KIT_TEXT_FIELDS.filter((field) => {
    const example = kit.prefill[field];
    return Boolean(example) && (draft[field] ?? "").trim() === example;
  });
}

/**
 * What publishing makes public, and whether anything can be bought, from the policy's status.
 * Said plainly and promising nothing: a page and a listing, and payments only where the policy
 * is switched on (`active`), or in Stripe's test mode where it is `proposed`.
 */
export function whatBecomesPublic(input: { publicUrl: string; policyStatus: "active" | "proposed" | null }): string[] {
  const lines = [
    `The fundraiser's own page goes up at ${input.publicUrl}, and it is listed on the fundraisers page.`,
    "Everything a sponsor reads is what is saved now: the project, the funding, each option's price and terms, and how delivery will be documented. Evidence stays private until you publish an item.",
  ];
  if (input.policyStatus === "active") lines.push("Sponsors can buy the options. Door Money holds each payment and releases your share under the delivery policy.");
  else if (input.policyStatus === "proposed") lines.push("Payments for this category are in Stripe's test mode: the options are shown, and no real money moves until Door Money switches the policy on.");
  return lines;
}
