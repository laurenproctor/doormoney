/*
  Starting a fundraiser from a sponsorship idea, or from scratch.

  The new-fundraiser page offers both. This file holds what the choice is allowed to do to the one
  form there is (FundraiserDraftForm): a kit named in a link loads, a kit fills examples into its own
  category and no other, switching category leaves nothing of the old category behind, a draft-only
  kit says it is one, and starting from scratch is the form as it always was.

  The state rules are a pure reducer (src/lib/starter-kit-draft.ts) and are tested directly. The
  form is then rendered on the server, with its save action mocked, to show the rules reach the
  inputs. Hospitality is a draft-only category (migration 0047). Both registries are tested: the one
  with its row, and the four-row one a database has until 0047 is applied to it.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mock, test } from "node:test";
import { FundraiserDraftInput, categoryErrors, type FundraiserDraft } from "@/lib/fundraiser-drafts";
import { catalogTemplates } from "@/lib/opportunities";
import { initialKitDraft, kitDraftReducer, type KitDraftAction, type KitDraftState } from "@/lib/starter-kit-draft";
import { kitRecommendations } from "@/lib/starter-kit-recommendations";
import { STARTER_KITS, starterKit, starterKitFromLink, type KitCategory } from "@/lib/starter-kits";

// The form posts to a server action that reaches the database, and borrows two class names from
// the dashboard shell, whose sign-out action reaches it too. Neither is what is being tested.
mock.module("@/app/actions/drafts", { namedExports: { saveDraftForm: async () => ({ ok: true }) } });
mock.module("@/app/actions/auth", { namedExports: { signOut: async () => {} } });
const { FundraiserDraftForm } = await import("@/components/FundraiserDraftForm");

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

/** The four launch categories, which is the whole registry until migration 0047 is applied. tests/starter-kits.test.ts reads the real one from the SQL. */
const REGISTRY: KitCategory[] = [
  { key: "film", label: "Film", detail_keys: ["format", "production_stage"], draft_enabled: true, publish_enabled: true },
  { key: "music", label: "Music", detail_keys: ["format"], draft_enabled: true, publish_enabled: true },
  { key: "sports", label: "Sports teams", detail_keys: ["sport", "level"], draft_enabled: true, publish_enabled: true },
  { key: "theater", label: "Theater", detail_keys: ["production", "venue"], draft_enabled: true, publish_enabled: true },
];
/** The registry with the row 0047 adds: drafts on, publishing off, two optional details. */
const WITH_HOSPITALITY: KitCategory[] = [...REGISTRY, { key: "hospitality", label: "Hospitality", detail_keys: ["venue_kind", "format"], draft_enabled: true, publish_enabled: false }];

/** A saved film draft, as loadFundraiserDraft returns one. */
const DRAFT = {
  id: "a0000000-0000-4000-8000-000000000001", slug: "the-ferry-a0000000", status: "draft", category_key: "film", title: "The Ferry",
  purpose: "Color, sound mix and festival deliverables.", description: null, audience_description: null, sponsor_promise: null,
  goal_cents: null, goal_currency: null, activity_mode: "online", activity_locations: [], timezone: null,
  fundraising_starts_on: null, fundraising_ends_on: null, starts_on: null, ends_on: null, delivery_due_at: null, bidding_closes_at: null,
  kind: null, show_count: null, expected_attendance: null, category_details: { production_stage: "post_production" },
} as FundraiserDraft;

const fresh = (over: { musicOrganizer?: boolean; kitKey?: string | null; categories?: KitCategory[] } = {}) =>
  initialKitDraft({ draft: null, musicOrganizer: over.musicOrganizer ?? false, kitKey: over.kitKey ?? null, categories: over.categories ?? REGISTRY });
const run = (state: KitDraftState, actions: KitDraftAction[], categories: KitCategory[] = REGISTRY) =>
  actions.reduce((s, a) => kitDraftReducer(s, a, categories), state);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(FundraiserDraftForm as never, props as never));
const valueOf = (html: string, name: string) => html.match(new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`))?.[1] ?? null;
const NO_RECOMMENDATIONS = { initialKitKey: null, linkError: null, recommendations: {} };

// ---------------------------------------------------------------
// Loading a starter kit from the URL
// ---------------------------------------------------------------

test("?template=fund_tour resolves to the kit, and the form opens on it", () => {
  const link = starterKitFromLink("fund_tour", REGISTRY);
  assert.equal(link.status, "ready");
  assert.ok(link.status === "ready" && link.kit.key === "fund_tour" && link.availability === "publishable");

  const state = fresh({ kitKey: "fund_tour" });
  assert.equal(state.mode, "idea");
  assert.equal(state.kitKey, "fund_tour");
  assert.equal(state.fields.category_key, "music");
  assert.equal(state.fields.title, "Upcoming tour");
  assert.equal(state.fields.kind, "tour");
  assert.equal(state.notice, null);
});

test("a link's kit chooses the category, even for a music organizer who would start on music", () => {
  const state = fresh({ kitKey: "fund_season", musicOrganizer: true });
  assert.equal(state.fields.category_key, "sports");
  assert.equal(state.fields.kind, "", "and no performance format comes with it");
});

test("a link to nothing, to an unknown kit, or to a repeated parameter is handled without echoing it", () => {
  assert.deepEqual(starterKitFromLink(undefined, REGISTRY), { status: "none" });
  assert.deepEqual(starterKitFromLink("", REGISTRY), { status: "none" });
  assert.deepEqual(starterKitFromLink("fund_everything", REGISTRY), { status: "refused", error: "unknown_kit" });
  assert.deepEqual(starterKitFromLink("<script>alert(1)</script>", REGISTRY), { status: "refused", error: "unknown_kit" });
  assert.deepEqual(starterKitFromLink("../../admin", REGISTRY), { status: "refused", error: "unknown_kit" });
  const repeated = starterKitFromLink(["fund_tour", "fund_season"], REGISTRY);
  assert.ok(repeated.status === "ready" && repeated.kit.key === "fund_tour", "the first one");
});

test("a refused link lands on the ordinary form with the reason, and a music organizer still starts on music", () => {
  const state = initialKitDraft({ draft: null, musicOrganizer: true, categories: REGISTRY, kitKey: null, linkError: "unknown_kit" });
  assert.equal(state.kitKey, null);
  assert.equal(state.notice, "unknown_kit");
  assert.equal(state.fields.category_key, "music");
  assert.equal(state.fields.title, "");
});

test("the page reads ?template, keeps it across sign-in, and hands the form only a kit the registry allows", () => {
  const page = read("src/app/dashboard/runs/new/page.tsx");
  assert.match(page, /searchParams: Promise</, "searchParams is a Promise in this Next");
  assert.match(page, /const \{ template \} = await searchParams/);
  assert.match(page, /starterKitFromLink\(template, categories\)/);
  assert.match(page, /requireUser\(asked \? `\/dashboard\/runs\/new\?template=\$\{asked\}`/);
  assert.match(page, /initialKitKey: link\.status === "ready" \? link\.kit\.key : null/);
});

test("the form rendered from a link holds the kit's examples in ordinary, editable inputs", () => {
  const html = render({ draft: null, categories: REGISTRY, musicOrganizer: true, starterKits: { ...NO_RECOMMENDATIONS, initialKitKey: "fund_tour" } });
  const kit = starterKit("fund_tour")!;
  assert.equal(valueOf(html, "title"), "Upcoming tour");
  assert.equal(valueOf(html, "purpose"), kit.prefill.purpose);
  assert.equal(valueOf(html, "starter_kit"), "fund_tour");
  assert.doesNotMatch(html, /<input[^>]*name="(title|purpose|sponsor_promise|audience_description)"[^>]*(readonly|disabled)/i, "every example can be edited");
  assert.match(html, /<option value="music" selected="">/);
  assert.match(html, /<option value="tour" selected="">/);
  assert.ok(text(html).includes("An example from the starter kit."));
  assert.ok(text(html).includes("Promise only what you will deliver, in your own words."));
});

// ---------------------------------------------------------------
// Category validation
// ---------------------------------------------------------------

test("a kit is never applied to the wrong category", () => {
  const onTheater = run(fresh(), [{ type: "category", key: "theater" }]);
  const refused = run(onTheater, [{ type: "kit", key: "fund_season" }]);
  assert.equal(refused.kitKey, null);
  assert.equal(refused.notice, "category_mismatch");
  assert.deepEqual(refused.fields, onTheater.fields, "and nothing of it reaches the form");

  assert.equal(run(onTheater, [{ type: "kit", key: "fund_everything" }]).notice, "unknown_kit");
  assert.equal(run(onTheater, [{ type: "kit", key: "production" }]).kitKey, "production", "its own category's kit is fine");
});

test("the picker only ever offers the selected category's kits", () => {
  for (const category of REGISTRY) {
    const html = render({ draft: { ...DRAFT, category_key: category.key }, categories: REGISTRY, musicOrganizer: false });
    assert.doesNotMatch(html, /Start from a sponsorship idea/, "a saved draft has no picker at all");
  }
  const onFilm = text(render({ draft: null, categories: REGISTRY, musicOrganizer: false, starterKits: { ...NO_RECOMMENDATIONS, initialKitKey: "documentary" } }));
  for (const kit of STARTER_KITS) assert.equal(onFilm.includes(kit.label), kit.categoryKey === "film", kit.key);
});

test("what a kit leaves in the form saves through the same validation as typing it", () => {
  for (const kit of STARTER_KITS.filter((k) => k.categoryKey !== "hospitality")) {
    const { fields } = fresh({ kitKey: kit.key });
    const parsed = FundraiserDraftInput.safeParse({ ...fields, kind: fields.kind || null, activity_mode: fields.activity_mode || null });
    assert.ok(parsed.success, `${kit.key}: ${parsed.success ? "" : parsed.error.message}`);
    assert.deepEqual(categoryErrors(parsed.data, REGISTRY), [], kit.key);
  }
  // The kit itself is not part of a draft: the schema is strict and refuses it.
  assert.equal(FundraiserDraftInput.safeParse({ category_key: "music", starter_kit: "fund_tour" }).success, false);
});

// ---------------------------------------------------------------
// Prefill behavior
// ---------------------------------------------------------------

test("a kit fills only empty fields, and what the organizer typed stays", () => {
  const typed = run(fresh(), [
    { type: "category", key: "sports" },
    { type: "field", name: "title", value: "Rovers, spring" },
    { type: "detail", key: "sport", value: "Soccer" },
    { type: "kit", key: "fund_season" },
  ]);
  assert.equal(typed.fields.title, "Rovers, spring");
  assert.equal(typed.fields.category_details.sport, "Soccer");
  assert.equal(typed.fields.purpose, starterKit("fund_season")!.prefill.purpose);
  assert.equal(typed.fields.activity_mode, "in_person");
});

test("every prefilled value can be edited, and an edit survives", () => {
  const edited = run(fresh({ kitKey: "short_film" }), [
    { type: "field", name: "purpose", value: "Two days of pickups and the sound mix." },
    { type: "field", name: "sponsor_promise", value: "A line in the special thanks." },
    { type: "detail", key: "format", value: "Short documentary" },
    { type: "field", name: "activity_mode", value: "online" },
  ]);
  assert.equal(edited.fields.purpose, "Two days of pickups and the sound mix.");
  assert.equal(edited.fields.sponsor_promise, "A line in the special thanks.");
  assert.equal(edited.fields.category_details.format, "Short documentary");
  assert.equal(edited.fields.activity_mode, "online");
  assert.equal(edited.kitKey, "short_film", "editing does not drop the kit");
});

test("picking a second kit replaces the first kit's examples and keeps the organizer's edits", () => {
  const state = run(fresh({ kitKey: "fund_tour" }), [
    { type: "field", name: "audience_description", value: "Folk clubs and listening rooms." },
    { type: "kit", key: "fund_residency" },
  ]);
  const residency = starterKit("fund_residency")!;
  assert.equal(state.kitKey, "fund_residency");
  assert.equal(state.fields.title, residency.prefill.title);
  assert.equal(state.fields.kind, "residency");
  assert.equal(state.fields.purpose, residency.prefill.purpose);
  assert.equal(state.fields.audience_description, "Folk clubs and listening rooms.");
});

test("a kit sets no goal, date, count, location or price, and the form names none for it", () => {
  const html = render({ draft: null, categories: REGISTRY, musicOrganizer: true, starterKits: { ...NO_RECOMMENDATIONS, initialKitKey: "fund_tour" } });
  for (const name of ["goal_amount", "fundraising_starts_on", "fundraising_ends_on", "starts_on", "ends_on", "show_count", "expected_attendance", "timezone"]) {
    assert.equal(valueOf(html, name), "", name);
  }
  assert.doesNotMatch(text(html), /\$\s?\d/, "no price anywhere on the form");
});

test("recommendations are names from the template registry, narrowed to the organizer, with no price", () => {
  const all = catalogTemplates();
  const tour = starterKit("fund_tour")!;
  assert.deepEqual(kitRecommendations(tour, all, "touring_band").map((r) => r.key), [...tour.suggestedOpportunityKeys]);
  assert.deepEqual(kitRecommendations(tour, all, "soloist").map((r) => r.key), ["posts_email"]);
  assert.deepEqual(kitRecommendations(tour, all, null), [], "no music profile, no music options to recommend");
  for (const r of kitRecommendations(tour, all, "touring_band")) assert.deepEqual(Object.keys(r).sort(), ["key", "name", "seenBy"], "music has suggested prices and a recommendation still carries none");

  const recommendations = { fund_season: kitRecommendations(starterKit("fund_season")!, all, null) };
  const out = text(render({ draft: null, categories: REGISTRY, musicOrganizer: false, starterKits: { initialKitKey: "fund_season", linkError: null, recommendations } }));
  assert.ok(out.includes("Sponsorship options to consider"));
  for (const name of ["Jersey front", "Warm-up tops", "Touchline banner"]) assert.ok(out.includes(name), name);
  assert.ok(out.includes("you choose which options to offer and you set every price"));
});

test("choosing a kit writes nothing: no lot, price, publish or payment is within reach of the picker", () => {
  for (const file of ["src/components/StarterKitPicker.tsx", "src/lib/starter-kit-draft.ts", "src/lib/starter-kit-recommendations.ts"]) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.doesNotMatch(code, /actions\/|saveLots|\.insert\(|\.update\(|\.upsert\(|\.rpc\(|stripe|checkout|price_cents|defaultPriceCents|status:\s*"open"/i, file);
  }
  const form = read("src/components/FundraiserDraftForm.tsx");
  assert.deepEqual([...form.matchAll(/from "@\/app\/actions\/([^"]+)"/g)].map((m) => m[1]), ["drafts"], "the form's one action is still saving a draft");
});

// ---------------------------------------------------------------
// Switching categories
// ---------------------------------------------------------------

test("switching category drops the kit, its examples and every detail of the old category", () => {
  const sports = run(fresh({ kitKey: "fund_season" }), [
    { type: "detail", key: "sport", value: "Soccer" },
    { type: "detail", key: "level", value: "youth" },
  ]);
  const film = run(sports, [{ type: "category", key: "film" }]);
  assert.equal(film.kitKey, null);
  assert.equal(film.fields.category_key, "film");
  assert.deepEqual(film.fields.category_details, {}, "no sport and no level of play on a film");
  for (const field of ["title", "purpose", "audience_description", "sponsor_promise", "activity_mode"] as const) assert.equal(film.fields[field], "", field);

  const html = render({ draft: null, categories: REGISTRY, musicOrganizer: false, starterKits: NO_RECOMMENDATIONS });
  assert.doesNotMatch(html, /name="detail_(sport|level)"/, "and with no category chosen no detail is asked for");
});

test("switching category keeps words the organizer wrote, which are theirs and not the kit's", () => {
  const state = run(fresh({ kitKey: "fund_season" }), [
    { type: "field", name: "purpose", value: "A second set of shirts and the minibus." },
    { type: "category", key: "theater" },
  ]);
  assert.equal(state.fields.purpose, "A second set of shirts and the minibus.");
  assert.equal(state.fields.title, "", "the kit's own example went");
  assert.equal(state.kitKey, null);
});

test("music's performance format never leaves music", () => {
  const tour = fresh({ kitKey: "fund_tour" });
  assert.equal(tour.fields.kind, "tour");
  assert.equal(run(tour, [{ type: "category", key: "sports" }]).fields.kind, "");
  // Even a format the organizer picked by hand: the database refuses one outside music (0041).
  const byHand = run(fresh({ musicOrganizer: true }), [{ type: "field", name: "kind", value: "season" }, { type: "category", key: "theater" }]);
  assert.equal(byHand.fields.kind, "");
  const parsed = FundraiserDraftInput.safeParse({ ...byHand.fields, kind: byHand.fields.kind || null, activity_mode: null });
  assert.ok(parsed.success);
});

test("hospitality's examples do not survive a switch to another category either", () => {
  const cart = fresh({ kitKey: "sponsored_martini_cart", categories: WITH_HOSPITALITY });
  assert.equal(cart.fields.category_key, "hospitality");
  const theater = run(cart, [{ type: "category", key: "theater" }], WITH_HOSPITALITY);
  assert.equal(theater.kitKey, null);
  assert.doesNotMatch(JSON.stringify(theater.fields), /cart|martini|spirits|dining/i);
  assert.deepEqual(theater.fields.category_details, {});
});

test("a saved draft gets its own details back when the organizer switches away and returns", () => {
  const state = initialKitDraft({ draft: DRAFT, musicOrganizer: false, categories: REGISTRY });
  assert.equal(state.mode, "scratch");
  const away = run(state, [{ type: "category", key: "sports" }]);
  assert.deepEqual(away.fields.category_details, {});
  assert.deepEqual(run(away, [{ type: "category", key: "film" }]).fields.category_details, { production_stage: "post_production" });
});

// ---------------------------------------------------------------
// Draft-only hospitality kits
// ---------------------------------------------------------------

test("where 0047 has not been applied, hospitality kits cannot be linked to, picked or listed", () => {
  assert.deepEqual(starterKitFromLink("chef_residency", REGISTRY), { status: "refused", error: "kit_unavailable" });
  assert.equal(run(fresh(), [{ type: "kit", key: "chef_residency" }]).notice, "kit_unavailable");
  const out = text(render({ draft: null, categories: REGISTRY, musicOrganizer: false, starterKits: { ...NO_RECOMMENDATIONS, linkError: "kit_unavailable" } }));
  assert.ok(out.includes("This starter kit is not available yet."));
  assert.doesNotMatch(out, /Hospitality|martini|Chef residency/i);
});

test("with the category in the registry, a hospitality kit works as a draft and says it is draft only", () => {
  const link = starterKitFromLink("sponsored_martini_cart", WITH_HOSPITALITY);
  assert.ok(link.status === "ready" && link.availability === "draft_only");
  // Even a registry row that allows publishing does not make the kit publishable.
  const published = WITH_HOSPITALITY.map((c) => (c.key === "hospitality" ? { ...c, publish_enabled: true } : c));
  const stillDraft = starterKitFromLink("sponsored_martini_cart", published);
  assert.ok(stillDraft.status === "ready" && stillDraft.availability === "draft_only");

  const html = render({ draft: null, categories: WITH_HOSPITALITY, musicOrganizer: false, starterKits: { ...NO_RECOMMENDATIONS, initialKitKey: "sponsored_martini_cart" } });
  const out = text(html);
  assert.equal(valueOf(html, "title"), "Martini cart");
  assert.match(html, /<option value="hospitality" selected="">/);
  assert.ok(out.includes("Draft only"));
  assert.ok(out.includes("This category is not open for publishing yet. A fundraiser started from this kit stays a private draft."));
  assert.ok(out.includes("Alcohol sponsorship has local rules."));
  assert.doesNotMatch(out, /Sponsorship options to consider/, "no recommendations were handed to this render");
  const recommended = kitRecommendations(starterKit("sponsored_restaurant_space")!, catalogTemplates(), null);
  assert.deepEqual(recommended.map((r) => r.key), ["sponsored_restaurant_space", "sponsored_table_plaque"], "hospitality's own templates, and nobody else's");
  for (const r of recommended) assert.deepEqual(Object.keys(r).sort(), ["key", "name", "seenBy"], "with no price");
  assert.match(html, /name="detail_venue_kind"/, "the two hospitality details are asked for");
  assert.match(html, /name="detail_format"[^>]*value="Sponsored experience"/, "and the kit answers the one it knows");
  assert.match(html, /name="detail_venue_kind"[^>]*value=""/, "the kind of venue is left to the organizer: not everybody is a restaurant");

  const { fields } = fresh({ kitKey: "sponsored_martini_cart", categories: WITH_HOSPITALITY });
  const parsed = FundraiserDraftInput.safeParse({ ...fields, kind: null, activity_mode: fields.activity_mode || null });
  assert.ok(parsed.success);
  assert.deepEqual(categoryErrors(parsed.data, WITH_HOSPITALITY), []);
  assert.deepEqual(categoryErrors(parsed.data, REGISTRY), ["Choose an available category."], "and without the row the save is refused, before the database refuses it too");
});

test("hospitality is not advertised as one of Door Money's categories anywhere a visitor reads them", () => {
  assert.match(read("tests/starter-kits.test.ts"), /hospitality is draft only twice over/, "the registry test that holds the switches is still there");
  for (const file of ["src/lib/starting-categories.ts", "src/lib/category-registry.ts", "src/app/page.tsx", "src/app/how-sponsorship-works/page.tsx", "src/app/signup/page.tsx", "src/app/fundraisers/page.tsx"]) {
    assert.doesNotMatch(read(file), /hospitality|restaurant/i, file);
  }
});

// ---------------------------------------------------------------
// Starting from scratch
// ---------------------------------------------------------------

test("starting from scratch is the form as it was: empty, and on music for a music organizer", () => {
  const musician = fresh({ musicOrganizer: true });
  assert.equal(musician.kitKey, null);
  assert.equal(musician.fields.category_key, "music");
  const other = fresh();
  assert.equal(other.fields.category_key, "");
  for (const state of [musician, other]) {
    for (const field of ["title", "purpose", "audience_description", "sponsor_promise", "activity_mode", "kind"] as const) assert.equal(state.fields[field], "", field);
    assert.deepEqual(state.fields.category_details, {});
  }
  const html = render({ draft: null, categories: REGISTRY, musicOrganizer: true, starterKits: NO_RECOMMENDATIONS });
  assert.equal(valueOf(html, "starter_kit"), null, "no kit is sent with the form");
  assert.match(html, /name="kind"/, "music still asks for its performance format");
  assert.match(html, /name="show_count"/);
  assert.match(html, /name="bidding_closes_utc"/);
});

test("choosing scratch after a kit takes the kit's examples back out and keeps the organizer's words", () => {
  const state = run(fresh({ kitKey: "fund_tour" }), [
    { type: "field", name: "purpose", value: "A van and nine nights of lodging." },
    { type: "mode", mode: "scratch" },
  ]);
  assert.equal(state.mode, "scratch");
  assert.equal(state.kitKey, null);
  assert.equal(state.fields.purpose, "A van and nine nights of lodging.");
  for (const field of ["title", "audience_description", "sponsor_promise", "kind", "activity_mode"] as const) assert.equal(state.fields[field], "", field);
  assert.equal(state.fields.category_key, "music", "the category is the organizer's choice and stays");
  assert.equal(run(state, [{ type: "mode", mode: "idea" }]).kitKey, null, "going back to ideas picks nothing by itself");
});

test("both ways to start are on the new form, and a saved draft is edited without either", () => {
  const fresh_ = text(render({ draft: null, categories: REGISTRY, musicOrganizer: false, starterKits: NO_RECOMMENDATIONS }));
  assert.ok(fresh_.includes("Start from a sponsorship idea"));
  assert.ok(fresh_.includes("Start from scratch"));
  assert.ok(fresh_.includes("Choose a category to see sponsorship ideas for it."));

  const html = render({ draft: DRAFT, categories: REGISTRY, musicOrganizer: false });
  assert.doesNotMatch(text(html), /Start from scratch|starter kit/i);
  assert.equal(valueOf(html, "title"), "The Ferry");
  assert.equal(valueOf(html, "id"), DRAFT.id);
  assert.match(html, /<option value="post_production" selected="">/);
});

test("the new-fundraiser page says a starter kit is an example that can be changed", () => {
  const page = read("src/app/dashboard/runs/new/page.tsx");
  assert.match(page, /A starter kit is an example, not a rule: change any part of it\./);
  assert.match(page, /Picking one saves nothing, offers nothing and sets no price\./);
});
