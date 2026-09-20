/*
  Sponsorship opportunities: the template, what an organizer chose, and what a sponsor bought.

  Four things are held here. A template belongs to one category and never appears under another.
  A sale method is how something is sold and never what it is. The organizer's price is the price,
  and a suggestion exists only where there is history behind it. And the database is the registry:
  a category this build has never heard of is represented from its rows alone, with no union type
  or enum to extend.

  That a mismatched lot is refused by the database is tested in SQL
  (supabase/tests/category_opportunities_test.sql), where the trigger actually runs.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { CATALOG } from "@/lib/catalog";
import {
  SALE_METHODS,
  askingPriceCents,
  catalogTemplates,
  isSaleMethod,
  opportunityFromLot,
  opportunityName,
  startingPriceCents,
  templateFitsFundraiser,
  templateFromRow,
  templateSections,
  templatesForFundraiser,
  type TemplateRow,
} from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const MIGRATION = read("supabase/migrations/0044_category_opportunities.sql");
const STATEMENTS = MIGRATION.replace(/--.*$/gm, "");

const LAUNCH = ["music", "sports", "film", "theater"];

/** A category nobody has written a line of TypeScript for, as its rows would come back. */
const DANCE: TemplateRow[] = [
  { key: "studio_wall", name: "Studio wall", group_key: "studio", category_key: "dance", applies_to: null, default_price_cents: null, default_period: "term", seen_by: "every class, every week", sort: 401, active: true, version: 1 },
  { key: "recital_program", name: "Recital program", group_key: "online", category_key: "dance", applies_to: null, default_price_cents: null, default_period: "term", seen_by: null, sort: 402, active: true, version: 2 },
];

// ---------------------------------------------------------------
// Sale methods
// ---------------------------------------------------------------

test("fixed price and bidding are the sale methods, and the database agrees", () => {
  assert.deepEqual(SALE_METHODS.map((m) => m.key), ["fixed", "auction"]);
  const enumLine = read("supabase/migrations/0001_init.sql").match(/create type sale_mode as enum \(([^)]*)\)/);
  assert.ok(enumLine);
  assert.deepEqual([...enumLine[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ["fixed", "auction"]);
});

test("a sale method is never a category, and a category is never a sale method", () => {
  for (const category of [...LAUNCH, "dance"]) assert.equal(isSaleMethod(category), false);
  for (const template of catalogTemplates()) assert.equal(isSaleMethod(template.category), false);
  // Every template can be sold either way: nothing about a template fixes how it is sold.
  assert.equal(Object.keys(catalogTemplates()[0]).some((k) => /mode|method|auction/i.test(k)), false);
});

// ---------------------------------------------------------------
// Category ownership
// ---------------------------------------------------------------

test("every template belongs to exactly one category", () => {
  for (const t of catalogTemplates()) assert.ok(typeof t.category === "string" && t.category.length > 0, `${t.key} has a category`);
  assert.equal(new Set(CATALOG.map((c) => c.key)).size, CATALOG.length, "and no key is offered twice");
});

test("all four starting categories can define opportunities", () => {
  const all = catalogTemplates();
  assert.ok(templatesForFundraiser(all, "music", "touring_band").length > 0);
  assert.ok(templatesForFundraiser(all, "music", "house_act").length > 0);
  assert.ok(templatesForFundraiser(all, "music", "soloist").length > 0);
  for (const category of ["sports", "film", "theater"]) {
    const offered = templatesForFundraiser(all, category, null);
    assert.ok(offered.length > 0, `${category} offers something`);
    assert.ok(offered.every((t) => t.category === category), `${category} offers only its own`);
  }
});

test("nothing crosses a category line, in either direction", () => {
  const all = catalogTemplates();
  for (const category of LAUNCH) {
    for (const t of templatesForFundraiser(all, category, "touring_band")) {
      assert.equal(templateFitsFundraiser(t, category), true);
      for (const other of LAUNCH.filter((c) => c !== category)) assert.equal(templateFitsFundraiser(t, other), false, `${t.key} does not fit ${other}`);
    }
  }
  assert.deepEqual(templatesForFundraiser(all, "opera", null), [], "a category with no templates borrows nobody else's");
});

test("the music act type narrows music, and is asked of nobody else", () => {
  const all = catalogTemplates();
  assert.deepEqual(templatesForFundraiser(all, "music", null), [], "a music fundraiser with no act type has nothing to narrow by");
  const soloist = templatesForFundraiser(all, "music", "soloist").map((t) => t.key);
  assert.ok(soloist.includes("case_lid") && !soloist.includes("kick_head"));
  // No act type, a band's act type: a theater company is offered the same thing either way.
  assert.deepEqual(templatesForFundraiser(all, "theater", null), templatesForFundraiser(all, "theater", "touring_band"));
  assert.ok(all.filter((t) => t.category !== "music").every((t) => t.appliesTo === null));
});

test("an act type on a row outside music is not read, whatever the row carries", () => {
  const row: TemplateRow = { ...DANCE[0], applies_to: ["touring_band"] };
  assert.equal(templateFromRow(row).appliesTo, null);
  const music: TemplateRow = { key: "kick_head", name: "Kick drum head", group_key: "onstage", category_key: "music", applies_to: ["touring_band", "house_act", "marching_band"], default_price_cents: 120000, default_period: "run", seen_by: "the room" };
  assert.deepEqual(templateFromRow(music).appliesTo, ["touring_band", "house_act"], "and an act type this build does not know is dropped, not trusted");
});

// ---------------------------------------------------------------
// A fifth category, from rows alone
// ---------------------------------------------------------------

test("a category this build has never heard of is represented from its rows", () => {
  const templates = DANCE.map(templateFromRow);
  assert.deepEqual(templates.map((t) => [t.key, t.category, t.group, t.period, t.version]), [
    ["studio_wall", "dance", "studio", "term", 1],
    ["recital_program", "dance", "online", "term", 2],
  ]);
  const offered = templatesForFundraiser([...catalogTemplates(), ...templates], "dance", null);
  assert.deepEqual(offered.map((t) => t.key), ["studio_wall", "recital_program"]);
  assert.ok(offered.every((t) => t.defaultPriceCents === null && t.blurb === null), "with no invented price and no borrowed words");
});

test("a section nobody wrote words for is drawn under its own name, and online stays last", () => {
  const sections = templateSections(DANCE.map(templateFromRow).reverse());
  assert.deepEqual(sections.map((s) => [s.group, s.eyebrow, s.heading]), [
    ["studio", "Studio", null],
    ["online", "Online and in print", "When reach matters, measure it."],
  ]);
  const theater = templateSections(templatesForFundraiser(catalogTemplates(), "theater", null));
  assert.deepEqual(theater.map((s) => s.group), ["stage", "front_of_house", "online"]);
  assert.equal(theater.flatMap((s) => s.items).length, 5, "every template lands in exactly one section");
});

test("the registry is read from the database, and the catalog file is only the fallback", async () => {
  const sbReturning = (result: { data: unknown; error: unknown }) =>
    ({ from: () => ({ select: () => ({ eq: () => ({ order: async () => result }) }) }) }) as never;

  const fromDb = await loadTemplates(sbReturning({ data: DANCE, error: null }), "dance");
  assert.deepEqual(fromDb.map((t) => t.key), ["studio_wall", "recital_program"]);

  // Before migration 0044 the select names two columns that do not exist yet, and errors.
  const beforeMigration = await loadTemplates(sbReturning({ data: null, error: { message: "column surfaces.active does not exist" } }), "theater");
  assert.deepEqual(beforeMigration.map((t) => t.key), CATALOG.filter((c) => c.category === "theater").map((c) => c.key));
  assert.deepEqual(await loadTemplates(sbReturning({ data: [], error: null }), "opera"), [], "an unknown category falls back to nothing, not to music");
  const thrown = await loadTemplates({ from: () => { throw new Error("network"); } } as never, "film");
  assert.ok(thrown.length > 0 && thrown.every((t) => t.category === "film"));
});

test("a known option speaks in the reviewed words, and an unknown one speaks for itself", () => {
  // The hosted row for the kick drum head still says "every photo". The file does not promise that.
  const hosted: TemplateRow = { key: "kick_head", name: "Kick drum head", group_key: "onstage", category_key: "music", applies_to: ["touring_band", "house_act"], default_price_cents: 120000, default_period: "run", seen_by: "the whole room, every show, every photo" };
  const template = templateFromRow(hosted);
  assert.equal(template.seenBy, CATALOG.find((c) => c.key === "kick_head")!.seenBy);
  assert.doesNotMatch(template.seenBy ?? "", /every photo/);
  assert.equal(template.defaultPriceCents, 120000, "what it costs and who it suits still come from the row");
  assert.equal(templateFromRow(DANCE[0]).seenBy, "every class, every week");
  assert.equal(templateFromRow(DANCE[1]).seenBy, null, "and nothing is invented where the row says nothing");
});

test("a retired template starts nothing new and is still there to be named", () => {
  const retired = templateFromRow({ ...DANCE[0], active: false });
  assert.deepEqual(templatesForFundraiser([retired], "dance", null), []);
  assert.equal(opportunityName({ label: null, templateKey: "studio_wall" }, [retired]), "Studio wall");
});

// ---------------------------------------------------------------
// Template, opportunity, purchased offer
// ---------------------------------------------------------------

test("the organizer's price is the price, whatever the template suggests", () => {
  const kick = catalogTemplates().find((t) => t.key === "kick_head")!;
  assert.equal(startingPriceCents(kick), 120000);
  const lot = opportunityFromLot({ id: "l1", run_id: "r1", surface_key: "kick_head", label: null, price_cents: 45000, mode: "auction", buy_now_cents: 90000, status: "open" });
  assert.equal(askingPriceCents(lot), 45000, "the suggestion is not consulted once an opportunity exists");
  assert.deepEqual(lot, { id: "l1", fundraiserId: "r1", templateKey: "kick_head", label: null, priceCents: 45000, saleMethod: "auction", buyNowCents: 90000, status: "open" });
});

test("no price is suggested where Door Money has never sold one", () => {
  for (const t of catalogTemplates().filter((c) => c.category !== "music")) assert.equal(startingPriceCents(t), null, `${t.key} starts empty`);
  for (const t of catalogTemplates().filter((c) => c.category === "music")) assert.ok((startingPriceCents(t) ?? 0) > 0, `${t.key} keeps the price it always had`);
});

test("an opportunity is named by the organizer first, then the template, then the key", () => {
  const templates = catalogTemplates();
  assert.equal(opportunityName({ label: "Case spot 2", templateKey: "case_sticker" }, templates), "Case spot 2");
  assert.equal(opportunityName({ label: null, templateKey: "foyer_banner" }, templates), "Foyer signage");
  assert.equal(opportunityName({ label: null, templateKey: "gone" }, templates), "gone");
});

test("a template that was never ticked is not an opportunity", () => {
  // There is no function from a template to an opportunity: only from a lot. Offering is an act.
  const exported = Object.keys({ templateFromRow, opportunityFromLot, catalogTemplates, templatesForFundraiser });
  assert.equal(exported.some((name) => /opportunityFromTemplate|defaultOpportunit/i.test(name)), false);
  const source = read("src/lib/opportunities.ts");
  assert.doesNotMatch(source, /export function \w*(FromTemplate|defaultOpportunit)/i);
});

// ---------------------------------------------------------------
// The migration
// ---------------------------------------------------------------

test("the migration adds, and rewrites no enum, table or name", () => {
  assert.doesNotMatch(STATEMENTS, /\brename\b/i, "nothing is renamed");
  assert.doesNotMatch(STATEMENTS, /drop\s+(table|column|view|type|trigger|function)/i, "nothing is dropped");
  assert.doesNotMatch(STATEMENTS, /(create|alter)\s+type/i, "no Postgres enum is created or extended: a category is a registry row");
  assert.match(STATEMENTS, /create trigger lots_category before insert or update on public\.lots/);
});

test("the migration leaves money alone", () => {
  assert.doesNotMatch(STATEMENTS, /(alter table|update|insert into|delete from)\s+public\.(purchases|bids|backings|payout_schedule|ledger|stripe_events|patrons)\b/i);
  assert.doesNotMatch(STATEMENTS, /price_cents\s*=|fee_cents|amount_cents|stripe/i, "no price, fee, amount or Stripe id is written");
  assert.match(STATEMENTS, /set template_snapshot = /, "the only backfill is the snapshot, on lots that had none");
});

test("what the organizer chose from is set by the database and granted to nobody", () => {
  assert.doesNotMatch(STATEMENTS, /grant[^;]*template_snapshot/i, "template_snapshot is in no grant, so the browser cannot read or write it");
  assert.match(STATEMENTS, /new\.template_snapshot := old\.template_snapshot/, "and an update cannot replace it");
  assert.match(STATEMENTS, /revoke all on function public\.guard_lot_category\(\) from public, anon, authenticated/);
});
