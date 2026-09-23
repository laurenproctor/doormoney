/*
  Saving a fundraiser's sponsorship opportunities.

  The form is not what decides which options exist. Before this, the save action walked the whole
  catalog whatever the fundraiser was, so a field named on_kick_head posted to a theater
  production became a kick drum head on a theater production. These hold the server side of the
  rule; supabase/tests/category_opportunities_test.sql holds the database side.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import type { TemplateRow } from "@/lib/opportunities";

type Lot = { id: string; surface_key: string; label: string | null; price_cents: number; mode: "fixed" | "auction"; status: string; buy_now_cents: number | null };
type Op = { verb: "insert" | "update" | "delete"; payload?: unknown; filters: Record<string, unknown> };

let act: { id: string; slug: string; type: string | null } = { id: "act-1", slug: "second-stage", type: null };
let run: { id: string; slug: string; status: string; category_key: string } | null = null;
let lots: Lot[] = [];
let registry: TemplateRow[] | null = null;
let insertError: { message: string } | null = null;
let ops: Op[] = [];
let templateFilter: string | null = null;

const row = (key: string, name: string, category: string, group: string, price: number | null, appliesTo: string[] | null = null, active = true): TemplateRow =>
  ({ key, name, group_key: group, category_key: category, applies_to: appliesTo, default_price_cents: price, default_period: "production", seen_by: "the house", sort: 1, active, version: 1 });

const ALL: TemplateRow[] = [
  row("kick_head", "Kick drum head", "music", "onstage", 120000, ["touring_band", "house_act"]),
  row("case_lid", "Case lid", "music", "onstage", 6000, ["soloist"]),
  row("foyer_banner", "Foyer signage", "theater", "front_of_house", null),
  row("playbill_credit", "Program credit", "theater", "front_of_house", null),
  row("jersey_front", "Jersey front", "sports", "field", null),
  row("end_credit", "End credit", "film", "screen", null),
  row("studio_wall", "Studio wall", "dance", "studio", null),
];

function from(table: string) {
  const state: { verb: Op["verb"] | "select"; payload?: unknown; filters: Record<string, unknown> } = { verb: "select", filters: {} };
  const answer = () => {
    if (state.verb !== "select") {
      ops.push({ verb: state.verb, payload: state.payload, filters: state.filters });
      return { data: null, error: state.verb === "insert" ? insertError : null };
    }
    if (table === "runs") return { data: run, error: null };
    if (table === "lots") return { data: lots, error: null };
    if (table === "surfaces") {
      templateFilter = String(state.filters.category_key);
      return { data: (registry ?? ALL).filter((t) => t.category_key === state.filters.category_key), error: null };
    }
    return { data: null, error: null };
  };
  const builder = {
    select() { return builder; },
    insert(payload: unknown) { state.verb = "insert"; state.payload = payload; return builder; },
    update(payload: unknown) { state.verb = "update"; state.payload = payload; return builder; },
    delete() { state.verb = "delete"; return builder; },
    eq(column: string, value: unknown) { state.filters[column] = value; return builder; },
    in(column: string, value: unknown) { state.filters[column] = value; return builder; },
    order() { return builder; },
    maybeSingle: async () => answer(),
    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) { return Promise.resolve(answer()).then(resolve, reject); },
  };
  return builder;
}

mock.module("next/cache", { namedExports: { revalidatePath() {} } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => ({ id: "owner" }), ownedAct: async () => act } });
mock.module("@/lib/supabase/server", { namedExports: { supabaseServer: async () => ({ from }), supabaseAdmin: () => ({ from }) } });

const { saveLots } = await import("@/app/actions/lots");

const formWith = (fields: Record<string, string>) => {
  const form = new FormData();
  form.set("run_id", "run-1");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
};
const inserted = () => ops.filter((o) => o.verb === "insert").flatMap((o) => o.payload as Record<string, unknown>[]);
const reset = (category: string, actType: string | null = null) => {
  act = { id: "act-1", slug: "second-stage", type: actType };
  run = { id: "run-1", slug: "winter", status: "draft", category_key: category };
  lots = []; ops = []; registry = null; insertError = null; templateFilter = null;
};

test("a theater fundraiser saves a theater option at the organizer's price", async () => {
  reset("theater");
  const result = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "750", mode_foyer_banner: "fixed" }));
  assert.equal(result.ok, true);
  assert.deepEqual(inserted(), [{ run_id: "run-1", surface_key: "foyer_banner", label: null, price_cents: 75000, mode: "fixed", buy_now_cents: null, reach_estimate: null, reach_basis: null }]);
  assert.equal(templateFilter, "theater", "the templates were read for the fundraiser's own category");
});

test("a field naming another category's option is never read, so it never becomes a lot", async () => {
  reset("theater");
  const result = await saveLots({ ok: false }, formWith({
    on_foyer_banner: "1", price_foyer_banner: "750",
    on_kick_head: "1", price_kick_head: "1200",
    on_jersey_front: "1", price_jersey_front: "900",
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(inserted().map((l) => l.surface_key), ["foyer_banner"]);
});

test("the category comes from the fundraiser the session owns, never from the form", async () => {
  reset("theater");
  await saveLots({ ok: false }, formWith({ category_key: "music", category: "music", on_kick_head: "1", price_kick_head: "1200" }));
  assert.deepEqual(inserted(), []);
  assert.equal(templateFilter, "theater");
});

test("a music fundraiser is still narrowed by its act type, and takes nothing from sports", async () => {
  reset("music", "soloist");
  const result = await saveLots({ ok: false }, formWith({
    on_case_lid: "1", price_case_lid: "80", mode_case_lid: "auction", buynow_case_lid: "200", count_case_lid: "2",
    on_kick_head: "1", price_kick_head: "1200",
    on_jersey_front: "1", price_jersey_front: "900",
  }));
  assert.equal(result.ok, true);
  assert.deepEqual(inserted(), [
    { run_id: "run-1", surface_key: "case_lid", label: "Case lid spot 1", price_cents: 8000, mode: "auction", buy_now_cents: 20000, reach_estimate: null, reach_basis: null },
    { run_id: "run-1", surface_key: "case_lid", label: "Case lid spot 2", price_cents: 8000, mode: "auction", buy_now_cents: 20000, reach_estimate: null, reach_basis: null },
  ]);
  assert.notEqual(inserted()[0].price_cents, 6000, "the organizer's price, not the suggested one");
});

test("outside music an option has no suggested price, so it cannot be offered without one", async () => {
  reset("film");
  const result = await saveLots({ ok: false }, formWith({ on_end_credit: "1", price_end_credit: "" }));
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /End credit/);
  assert.deepEqual(ops, [], "nothing was written, and no price was filled in for them");
});

test("both sale methods work in every category", async () => {
  for (const [category, key] of [["sports", "jersey_front"], ["film", "end_credit"], ["theater", "playbill_credit"]] as const) {
    for (const mode of ["fixed", "auction"] as const) {
      reset(category);
      const result = await saveLots({ ok: false }, formWith({ [`on_${key}`]: "1", [`price_${key}`]: "500", [`mode_${key}`]: mode }));
      assert.equal(result.ok, true, `${category} ${mode}`);
      assert.equal(inserted()[0].mode, mode);
      assert.equal(inserted()[0].surface_key, key);
    }
  }
});

test("a fifth category is offered from its registry rows, with no change to this code", async () => {
  reset("dance");
  const result = await saveLots({ ok: false }, formWith({ on_studio_wall: "1", price_studio_wall: "300" }));
  assert.equal(result.ok, true);
  assert.deepEqual(inserted().map((l) => [l.surface_key, l.price_cents]), [["studio_wall", 30000]]);
});

test("a retired template starts nothing new, and a spot already on it stays editable", async () => {
  reset("theater");
  registry = [row("foyer_banner", "Foyer signage", "theater", "front_of_house", null, null, false), ALL[3]];
  const fresh = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "750" }));
  assert.equal(fresh.ok, true);
  assert.deepEqual(inserted(), [], "no new spot on a retired option");

  ops = [];
  lots = [{ id: "lot-1", surface_key: "foyer_banner", label: null, price_cents: 75000, mode: "fixed", status: "open", buy_now_cents: null }];
  const edit = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "800" }));
  assert.equal(edit.ok, true);
  const updated = ops.find((o) => o.verb === "update");
  assert.deepEqual(updated?.payload, { label: null, price_cents: 80000, mode: "fixed", buy_now_cents: null, reach_estimate: null, reach_basis: null });
  assert.equal(updated?.filters.id, "lot-1");
});

test("a sold spot is never removed by a save, whatever the form leaves out", async () => {
  reset("theater");
  lots = [
    { id: "sold-1", surface_key: "foyer_banner", label: null, price_cents: 75000, mode: "fixed", status: "sold", buy_now_cents: null },
    { id: "open-1", surface_key: "playbill_credit", label: null, price_cents: 20000, mode: "fixed", status: "open", buy_now_cents: null },
  ];
  const result = await saveLots({ ok: false }, formWith({}));
  assert.equal(result.ok, true);
  const removed = ops.filter((o) => o.verb === "delete");
  assert.equal(removed.length, 1);
  assert.deepEqual(removed[0].filters, { id: ["open-1"], status: "open" });
  assert.equal(ops.some((o) => o.verb === "update"), false, "and the sold spot's terms were not touched");
});

test("what the database refuses is said in words", async () => {
  reset("theater");
  insertError = { message: "opportunity_category_mismatch" };
  const mismatch = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "750" }));
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error ?? "", /different category/);

  insertError = { message: "sponsorship_option_retired" };
  const retired = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "750" }));
  assert.match(retired.error ?? "", /no longer offered/);
});

test("somebody else's fundraiser is refused before any template is read", async () => {
  reset("theater");
  run = null;
  const result = await saveLots({ ok: false }, formWith({ on_foyer_banner: "1", price_foyer_banner: "750" }));
  assert.equal(result.ok, false);
  assert.equal(templateFilter, null);
  assert.deepEqual(ops, []);
});
