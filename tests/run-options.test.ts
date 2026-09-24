/*
  The sponsorship options table on a fundraiser's Overview, and the tabs the page is cut into.

  Two rules worth holding. An option's "current" figure is what somebody has actually offered
  wherever one has, and the organizer's asking price only where nobody has: a price on an unsold
  option is not money and must never be shown as though it were. And the folding that keeps a long
  list readable never folds away a row somebody has to act on.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { collapseOptions, optionRows, type OptionLot } from "@/lib/run-options";
import { currentTab, fundraiserTabs, readinessHref, tabFromParam } from "@/lib/fundraiser-tabs";
import type { WorkRow } from "@/lib/dashboardModel";

const lot = (id: string, over: Partial<OptionLot> = {}): OptionLot => ({
  id,
  surface_key: "kick_drum",
  label: null,
  price_cents: 40_000,
  mode: "fixed",
  status: "open",
  ...over,
});

const purchase = (id: string, lotId: string, over: Partial<WorkRow> = {}): WorkRow => ({
  id,
  lotId,
  sponsor: "Gowanus Coffee",
  option: "Kick drum head",
  amountCents: 120_000,
  logo: "approved",
  paymentStatus: "held",
  markNote: null,
  markText: null,
  markUrl: null,
  ...over,
});

const TEMPLATES = [{ key: "kick_drum", name: "Kick drum head" }];

test("an option reports what was offered, and only asks where nobody has offered", () => {
  const rows = optionRows({
    lots: [lot("a"), lot("b", { mode: "auction" }), lot("c"), lot("d", { mode: "auction" })],
    templates: TEMPLATES,
    topBids: { b: 63_500 },
    work: [purchase("p1", "c", { amountCents: 120_000 })],
  });
  const by = Object.fromEntries(rows.map((r) => [r.lotIds[0], r]));

  // A fixed price is the price, not an opening number, so it never reads as an ask.
  assert.deepEqual([by.a.state, by.a.amountsCents, by.a.asking], ["open", [40_000], false]);
  assert.deepEqual([by.d.state, by.d.amountsCents, by.d.asking], ["open", [40_000], true]);
  assert.deepEqual([by.b.state, by.b.amountsCents, by.b.asking], ["bids", [63_500], false]);
  assert.deepEqual([by.c.state, by.c.amountsCents, by.c.asking], ["sold", [120_000], false]);
  assert.equal(by.c.sponsor, "Gowanus Coffee");
  assert.equal(by.c.purchaseId, "p1");
  // Nobody is named on an option nobody has bought.
  assert.equal(by.b.sponsor, null);
});

test("what is waiting on the organizer sorts to the top, and says so", () => {
  const rows = optionRows({
    lots: [lot("a"), lot("b"), lot("c")],
    templates: TEMPLATES,
    topBids: {},
    work: [purchase("p1", "c", { logo: "review" })],
  });
  assert.equal(rows[0].state, "review");
  assert.equal(rows[0].lotIds[0], "c");
});

test("a long list folds only the rows nothing is waiting on", () => {
  const lots = [
    ...Array.from({ length: 8 }, (_, i) => lot(`open${i}`, { price_cents: 10_000 + i })),
    lot("sold"),
    lot("review"),
  ];
  const rows = optionRows({
    lots,
    templates: TEMPLATES,
    topBids: {},
    work: [purchase("p1", "sold"), purchase("p2", "review", { logo: "review" })],
  });
  const folded = collapseOptions(rows);

  // The two that carry a sponsorship keep their own lines; the eight idle ones become one.
  assert.equal(folded.length, 3);
  assert.deepEqual(folded.map((r) => r.state), ["review", "sold", "open"]);
  const open = folded[2];
  assert.equal(open.lotIds.length, 8);
  assert.equal(open.amountsCents.length, 8, "every amount is kept, not summed");
  assert.match(open.name, / and /, "and the names read as a list");

  // Under the limit nothing is folded at all.
  assert.equal(collapseOptions(rows.slice(0, 5)).length, 5);
});

test("the tabs a fundraiser has depend on the fundraiser, and only waiting is coloured", () => {
  const href = (t: string) => `?tab=${t}`;
  const full = fundraiserTabs(
    { options: 9, deliveryWaiting: 2, hasDelivery: true, dates: 18, datesLabel: "Shows" },
    href,
  );
  assert.deepEqual(full.map((t) => t.key), ["overview", "options", "delivery", "dates", "details"]);
  assert.equal(full.find((t) => t.key === "delivery")?.tone, "attention");
  assert.equal(full.find((t) => t.key === "options")?.tone, undefined);

  // A category with no dated events has no dates tab, and a fundraiser with no sponsorship has
  // nothing to deliver against.
  const bare = fundraiserTabs({ options: 0, deliveryWaiting: 0, hasDelivery: false, dates: null, datesLabel: "Shows" }, href);
  assert.deepEqual(bare.map((t) => t.key), ["overview", "options", "details"]);
  assert.equal(bare[1].count, null, "and a count of nothing draws no pill");

  // A tab that is not there falls back to Overview rather than to an empty page.
  assert.equal(currentTab("dates", bare), "overview");
  assert.equal(currentTab("options", bare), "options");
  assert.equal(tabFromParam("nonsense"), null);
  assert.equal(tabFromParam(["details", "options"]), "details");
});

test("a readiness step points at the tab that draws it", () => {
  assert.equal(readinessHref("r1", { key: "lots", href: "#placements" }), "/dashboard/runs/r1?tab=options");
  assert.equal(readinessHref("r1", { key: "verification", href: "#verification" }), "/dashboard/runs/r1?tab=details");
  // An address of its own is left alone; an anchor nothing draws any more is dropped.
  assert.equal(readinessHref("r1", { key: "profile", href: "/dashboard/act" }), "/dashboard/act");
  assert.equal(readinessHref("r1", { key: "publish", href: undefined }), null);
});
