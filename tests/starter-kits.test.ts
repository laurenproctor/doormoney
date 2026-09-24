/*
  Starter kits: the fundraising situations an organizer can start a draft from.

  Five things are held here. The registry is well formed: stable unique keys, a version, a category
  and words on every kit. A kit belongs to one category and never appears under another. A kit
  points at sponsorship option templates that exist, in its own category, and never carries a price.
  The database decides what a kit may do: a category with no registry row has no usable kits, which
  is where hospitality stands, and nothing in this file can publish it. And applying a kit fills
  gaps in a form, as a copy, without touching what it was given.

  The category rows below are read out of the migrations, so this fails when the registry moves and
  the kits do not.
*/
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CATALOG } from "@/lib/catalog";
import { detailValueErrors } from "@/lib/categories";
import { FundraiserDraftInput, categoryErrors } from "@/lib/fundraiser-drafts";
import { catalogTemplates, templatesForFundraiser } from "@/lib/opportunities";
import {
  KIT_TEXT_FIELDS,
  STARTER_KITS,
  STARTER_KIT_ERROR_MESSAGE,
  applyStarterKit,
  draftOnlyStarterKits,
  enabledStarterKits,
  kitFitsCategory,
  starterKit,
  starterKitAvailability,
  starterKitGroups,
  starterKitsForCategory,
  suggestedTemplates,
  type KitCategory,
  type StarterKit,
} from "@/lib/starter-kits";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const MIGRATIONS = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
const SQL = MIGRATIONS.map((f) => read(`supabase/migrations/${f}`).replace(/--.*$/gm, "")).join("\n");

/**
 * The registry as the migrations leave it: the rows 0038 seeded, which of them 0041 lets publish,
 * and the row 0047 adds, which states its own switches.
 */
function registry(): KitCategory[] {
  const seed = SQL.match(/insert into public\.fundraiser_categories \(key, label, detail_keys\) values([\s\S]*?);/);
  assert.ok(seed, "the category seed in migration 0038");
  const publishable = new Set<string>();
  for (const m of SQL.matchAll(/update public\.fundraiser_categories set publish_enabled = true where key in \(([^)]*)\)/g)) {
    for (const k of m[1].matchAll(/'([^']+)'/g)) publishable.add(k[1]);
  }
  const keys = (list: string) => [...list.matchAll(/'([^']+)'/g)].map((k) => k[1]);
  const launch = [...seed[1].matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*array\[([^\]]*)\]\)/g)].map((m) => ({
    key: m[1], label: m[2], detail_keys: keys(m[3]), draft_enabled: true, publish_enabled: publishable.has(m[1]),
  }));
  const later = [...SQL.matchAll(/insert into public\.fundraiser_categories \(key, label, detail_keys, draft_enabled, publish_enabled\) values\s*\('([a-z_]+)',\s*'([^']+)',\s*array\[([^\]]*)\](?:::text\[\])?,\s*(true|false),\s*(true|false)\)/g)].map((m) => ({
    key: m[1], label: m[2], detail_keys: keys(m[3]), draft_enabled: m[4] === "true", publish_enabled: m[5] === "true" || publishable.has(m[1]),
  }));
  // A later migration may rename a category (0049 gave hospitality its public name). The key never moves.
  const renamed = new Map<string, string>();
  for (const m of SQL.matchAll(/update public\.fundraiser_categories\s+set label = '([^']+)'\s+where key = '([a-z_]+)'/g)) renamed.set(m[2], m[1]);
  return [...launch, ...later].map((c) => ({ ...c, label: renamed.get(c.key) ?? c.label }));
}

const REGISTRY = registry();
const LAUNCH = ["music", "sports", "film", "theater"];
const keysOf = (kits: readonly StarterKit[]) => kits.map((k) => k.key);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/** Every string a reader could see on a kit. */
const words = (kit: StarterKit) => [
  kit.label, kit.shortDescription, kit.whatItFunds, kit.note ?? "", ...kit.suggestedNeeds, ...kit.suggestedSponsorTypes,
  ...KIT_TEXT_FIELDS.map((field) => kit.prefill[field] ?? ""),
];

// ---------------------------------------------------------------
// The registry
// ---------------------------------------------------------------

test("the test reads the real category registry", () => {
  assert.deepEqual(REGISTRY.map((c) => c.key), [...LAUNCH, "hospitality", "other", "digital_workers"]);
  assert.ok(REGISTRY.filter((c) => LAUNCH.includes(c.key)).every((c) => c.publish_enabled), "0041 turned publishing on for the four");
  assert.deepEqual(REGISTRY.find((c) => c.key === "hospitality"), { key: "hospitality", label: "Restaurants & hospitality", detail_keys: ["venue_kind", "format"], draft_enabled: true, publish_enabled: false }, "0047 adds hospitality for drafts only, and 0049 gives it its public name");
  assert.deepEqual(REGISTRY.find((c) => c.key === "other"), { key: "other", label: "Other", detail_keys: [], draft_enabled: true, publish_enabled: false }, "0049 adds Other for drafts only, with no details of its own");
  assert.deepEqual(REGISTRY.find((c) => c.key === "digital_workers"), { key: "digital_workers", label: "Digital workers", detail_keys: [], draft_enabled: true, publish_enabled: false });
  assert.equal(REGISTRY.some((c) => c.key === "restaurants"), false, "there is one hospitality key");
});

test("the starting kits are the ones asked for, under the registry's category keys", () => {
  assert.deepEqual(keysOf(starterKitsForCategory("music")), ["fund_tour", "fund_recording_release", "fund_residency"]);
  assert.deepEqual(keysOf(starterKitsForCategory("sports")), ["fund_season", "tournament_travel", "equipment_and_training", "community_clinic"]);
  assert.deepEqual(keysOf(starterKitsForCategory("film")), ["short_film", "documentary", "screening_series"]);
  assert.deepEqual(keysOf(starterKitsForCategory("theater")), ["production", "theater_residency", "venue_run"]);
  assert.deepEqual(keysOf(starterKitsForCategory("hospitality")), [
    "sponsored_martini_cart", "sponsored_table_plaque", "chef_residency", "dinner_series", "community_meal_program", "sponsored_restaurant_space",
  ]);
  assert.deepEqual(keysOf(starterKitsForCategory("digital_workers")), ["start_independent_project", "build_digital_product", "publish_independent_research"]);
  assert.equal(STARTER_KITS.length, 22, "and no others");
});

test("every kit has a stable unique key, a version, a category and words", () => {
  const keys = keysOf(STARTER_KITS);
  assert.equal(new Set(keys).size, keys.length, "keys are unique across categories, not only within one");
  for (const kit of STARTER_KITS) {
    assert.match(kit.key, /^[a-z][a-z0-9_]{1,39}$/, kit.key);
    assert.match(kit.categoryKey, /^[a-z][a-z0-9_]{1,39}$/, `${kit.key}: the registry's key format`);
    assert.ok(Number.isInteger(kit.version) && kit.version >= 1, `${kit.key}: version`);
    for (const text of [kit.label, kit.shortDescription, kit.whatItFunds]) assert.ok(text.trim().length > 0, kit.key);
    assert.ok(kit.suggestedNeeds.length >= 2 && kit.suggestedSponsorTypes.length >= 2, `${kit.key}: prompts`);
    assert.equal(typeof kit.enabled, "boolean");
    assert.equal(typeof kit.draftOnly, "boolean");
  }
});

test("a kit is looked up by key, and an unknown key is null and never a default", () => {
  assert.equal(starterKit("fund_season")?.categoryKey, "sports");
  assert.equal(starterKit("fund_everything"), null);
  assert.equal(starterKit(null), null);
  assert.equal(starterKit(""), null);
});

// ---------------------------------------------------------------
// Category filtering
// ---------------------------------------------------------------

test("a category lists its own kits and nobody else's", () => {
  for (const category of [...LAUNCH, "hospitality", "digital_workers"]) {
    const kits = starterKitsForCategory(category);
    assert.ok(kits.length > 0, category);
    assert.ok(kits.every((k) => k.categoryKey === category), category);
  }
  assert.deepEqual(starterKitsForCategory("dance"), [], "a category with no kits has none, and borrows none");
  assert.deepEqual(starterKitsForCategory(""), []);
  assert.equal(STARTER_KITS.length, [...LAUNCH, "hospitality", "digital_workers"].reduce((n, c) => n + starterKitsForCategory(c).length, 0), "no kit sits outside these");
});

test("a kit fits its own category only", () => {
  const season = starterKit("fund_season")!;
  assert.equal(kitFitsCategory(season, "sports"), true);
  for (const other of ["music", "film", "theater", "hospitality", "", null, undefined]) assert.equal(kitFitsCategory(season, other), false, String(other));
});

test("enabled kits and draft-only kits are separate lists", () => {
  const enabled = enabledStarterKits();
  const draftOnly = draftOnlyStarterKits();
  assert.ok(enabled.every((k) => k.enabled && !k.draftOnly));
  assert.ok(draftOnly.every((k) => k.enabled && k.draftOnly));
  assert.deepEqual(keysOf(enabled).filter((k) => keysOf(draftOnly).includes(k)), [], "no kit is in both");
  assert.deepEqual(new Set(enabled.map((k) => k.categoryKey)), new Set(LAUNCH));
  assert.deepEqual(keysOf(enabledStarterKits("film")), ["short_film", "documentary", "screening_series"]);
  assert.deepEqual(enabledStarterKits("hospitality"), []);
  assert.deepEqual(keysOf(draftOnlyStarterKits("hospitality")), keysOf(starterKitsForCategory("hospitality")));
  assert.deepEqual(enabledStarterKits("digital_workers"), []);
  assert.deepEqual(keysOf(draftOnlyStarterKits("digital_workers")), keysOf(starterKitsForCategory("digital_workers")));
  assert.deepEqual(draftOnlyStarterKits("music"), []);
});

// ---------------------------------------------------------------
// Hospitality, and what the database lets a kit do
// ---------------------------------------------------------------

test("hospitality is draft only twice over: in the registry, and on every one of its kits", () => {
  // The registry: one migration names the category, it says publishing is off, and nothing later
  // turns it on. The list is a tripwire, not the gate: a migration is added here only once the two
  // assertions below have been checked against it. 0053 names hospitality to scope one discovery
  // tag to it and to assert, in the migration itself, that it opened nothing.
  assert.deepEqual(MIGRATIONS.filter((f) => /hospitality/i.test(read(`supabase/migrations/${f}`))), ["0047_hospitality_draft_category.sql", "0048_draft_options_are_private.sql", "0049_restaurants_and_other_categories.sql", "0050_patron_profile_customization.sql", "0053_discovery_contract.sql", "0054_discovery_read_model.sql"]);
  assert.doesNotMatch(SQL, /publish_enabled\s*=\s*true[^;]*hospitality/i, "no migration switches hospitality publishing on");
  // No delivery policy: that row is what would let one be bought, in test mode first (0045).
  assert.doesNotMatch(SQL, /insert into (?:public\.)?delivery_policies[^;]*hospitality/i, "no migration gives hospitality a delivery policy");
  // The kits: a second switch, so a registry change alone never makes one publishable.
  assert.ok(starterKitsForCategory("hospitality").every((k) => k.draftOnly));
  for (const kit of starterKitsForCategory("hospitality")) assert.equal(starterKitAvailability(kit, REGISTRY), "draft_only", kit.key);
});

test("a kit that is not draft only belongs to a category the registry lets publish", () => {
  const publishable = new Set(REGISTRY.filter((c) => c.publish_enabled).map((c) => c.key));
  for (const kit of STARTER_KITS.filter((k) => !k.draftOnly)) assert.ok(publishable.has(kit.categoryKey), `${kit.key}: ${kit.categoryKey} cannot publish`);
});

test("the registry decides availability, and this file can only be stricter", () => {
  const martini = starterKit("sponsored_martini_cart")!;
  const season = starterKit("fund_season")!;
  assert.equal(starterKitAvailability(season, REGISTRY), "publishable");
  assert.equal(starterKitAvailability(martini, REGISTRY), "draft_only");
  // A database where 0047 has not been applied yet has no row, and then there is no kit.
  assert.equal(starterKitAvailability(martini, REGISTRY.filter((c) => c.key !== "hospitality")), "unavailable", "no registry row, no kit");

  // Even a row somebody switched to publish: the kit still holds to drafts.
  const opened: KitCategory[] = REGISTRY.map((c) => (c.key === "hospitality" ? { ...c, publish_enabled: true } : c));
  assert.equal(starterKitAvailability(martini, opened), "draft_only");

  const noDrafts = REGISTRY.map((c) => (c.key === "sports" ? { ...c, draft_enabled: false } : c));
  assert.equal(starterKitAvailability(season, noDrafts), "unavailable");
  const notPublishing = REGISTRY.map((c) => (c.key === "sports" ? { ...c, publish_enabled: false } : c));
  assert.equal(starterKitAvailability(season, notPublishing), "draft_only");
  // draftCategories() does not select publish_enabled today. Not knowing reads as no.
  const unknown = REGISTRY.map((c) => ({ key: c.key, label: c.label, detail_keys: c.detail_keys, draft_enabled: c.draft_enabled }));
  assert.equal(starterKitAvailability(season, unknown), "draft_only");
  assert.equal(starterKitAvailability({ ...season, enabled: false }, REGISTRY), "unavailable", "a retired kit");
  assert.equal(starterKitAvailability(season, []), "unavailable");
});

test("a picker shows the registry's categories, with new categories marked draft only", () => {
  const groups = starterKitGroups(REGISTRY);
  assert.deepEqual(groups.map((g) => g.category.key), [...LAUNCH, "hospitality", "digital_workers"]);
  assert.deepEqual(groups.map((g) => g.label), ["Music", "Sports teams", "Film", "Theater", "Restaurants & hospitality", "Digital workers"]);
  assert.equal(groups.some((g) => g.category.key === "other"), false, "Other has no kits, so it draws no group: an example there would be an invented promise");
  assert.deepEqual(starterKitsForCategory("other"), []);
  for (const g of groups) assert.ok(g.kits.every((k) => k.availability === (LAUNCH.includes(g.category.key) ? "publishable" : "draft_only")), g.category.key);
  assert.equal(groups.flatMap((g) => g.kits).length, 22);

  const withDance = starterKitGroups([...REGISTRY, { key: "dance", label: "Dance", detail_keys: [], draft_enabled: true, publish_enabled: false }]);
  assert.deepEqual(withDance.map((g) => g.category.key), [...LAUNCH, "hospitality", "digital_workers"], "a category with no kits draws no empty group");
});

// ---------------------------------------------------------------
// Templates: pointed at, never copied, never priced
// ---------------------------------------------------------------

test("a kit suggests only templates that exist, in its own category", () => {
  for (const kit of STARTER_KITS) {
    assert.equal(new Set(kit.suggestedOpportunityKeys).size, kit.suggestedOpportunityKeys.length, `${kit.key}: no repeats`);
    for (const key of kit.suggestedOpportunityKeys) {
      const template = CATALOG.find((s) => s.key === key);
      assert.ok(template, `${kit.key}: ${key} is not a sponsorship option`);
      assert.equal(template.category, kit.categoryKey, `${kit.key}: ${key} belongs to ${template.category}`);
    }
  }
  for (const kit of STARTER_KITS) assert.ok(kit.suggestedOpportunityKeys.length > 0, `${kit.key}: points at something`);
  // Hospitality's kits and templates share names, so each kit leads with its own template.
  for (const kit of starterKitsForCategory("hospitality")) assert.equal(kit.suggestedOpportunityKeys[0], kit.key, kit.key);
  assert.ok(starterKitsForCategory("hospitality").every((k) => k.version === 2), "their content changed, so their version did");
});

test("no kit carries a price, a goal or an amount, in any category", () => {
  const fieldNames = (value: unknown): string[] =>
    value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value).flatMap(([k, v]) => [k, ...fieldNames(v)]) : [];
  for (const kit of STARTER_KITS) {
    assert.deepEqual(fieldNames(kit).filter((name) => /price|cents|amount|goal|cost/i.test(name)), [], kit.key);
    for (const text of words(kit)) assert.doesNotMatch(text, /[$£€]|\d/, `${kit.key}: "${text}" reads like a number`);
  }
});

test("suggested templates are narrowed to what the fundraiser may offer", () => {
  const all = catalogTemplates();
  const tour = starterKit("fund_tour")!;
  assert.deepEqual(suggestedTemplates(tour, templatesForFundraiser(all, "music", "touring_band")).map((t) => t.key), [...tour.suggestedOpportunityKeys], "in the kit's order");
  assert.deepEqual(suggestedTemplates(tour, templatesForFundraiser(all, "music", "soloist")).map((t) => t.key), ["posts_email"], "a soloist has no kick drum");
  assert.deepEqual(suggestedTemplates(tour, templatesForFundraiser(all, "music", null)), [], "no act type, no music options");

  const season = starterKit("fund_season")!;
  assert.deepEqual(suggestedTemplates(season, templatesForFundraiser(all, "sports", null)).map((t) => t.key), [...season.suggestedOpportunityKeys]);
  assert.deepEqual(suggestedTemplates(season, all.map((t) => (t.key === "jersey_front" ? { ...t, active: false } : t))).some((t) => t.key === "jersey_front"), false, "a retired template");
  assert.deepEqual(suggestedTemplates(season, all.map((t) => (t.key === "jersey_front" ? { ...t, category: "film" } : t))).some((t) => t.key === "jersey_front"), false, "another category's template");
  // A template is a suggestion and stays one: what comes back is the template, with no lot on it.
  for (const t of suggestedTemplates(season, all)) assert.equal(t.defaultPriceCents, null, "and no suggested price outside music");
});

// ---------------------------------------------------------------
// Prefill
// ---------------------------------------------------------------

test("a kit prefills examples and the details choosing it makes true, and never a fact", () => {
  const ALLOWED = [...KIT_TEXT_FIELDS, "kind", "activity_mode", "category_details"];
  for (const kit of STARTER_KITS) {
    assert.deepEqual(Object.keys(kit.prefill).filter((k) => !ALLOWED.includes(k)), [], `${kit.key}: no goal, date, count, location or price`);
    for (const field of ["purpose", "audience_description", "sponsor_promise"] as const) assert.ok(kit.prefill[field], `${kit.key}: an example ${field}`);
    assert.ok((kit.prefill.title ?? "").length <= 60, `${kit.key}: a name fits the name field`);
    if (kit.categoryKey !== "music") assert.equal(kit.prefill.kind, undefined, `${kit.key}: a performance format is a music idea`);
    const category = REGISTRY.find((c) => c.key === kit.categoryKey);
    const details = { ...(kit.prefill.category_details ?? {}) };
    if (!category) {
      assert.deepEqual(details, {}, `${kit.key}: no registry row, so no detail keys to fill`);
      continue;
    }
    for (const key of Object.keys(details)) assert.ok(category.detail_keys.includes(key), `${kit.key}: ${kit.categoryKey} does not use ${key}`);
    assert.deepEqual(detailValueErrors(kit.categoryKey, details, category.detail_keys), [], `${kit.key}: a closed list gets a value from the list`);
  }
});

test("what a kit produces passes the same validation as anything an organizer typed", () => {
  for (const kit of STARTER_KITS.filter((k) => starterKitAvailability(k, REGISTRY) !== "unavailable")) {
    const applied = applyStarterKit(kit.key, {}, REGISTRY);
    assert.ok(applied.ok, kit.key);
    const parsed = FundraiserDraftInput.safeParse(applied.values);
    assert.ok(parsed.success, `${kit.key}: ${parsed.success ? "" : parsed.error.message}`);
    assert.deepEqual(categoryErrors(parsed.data, REGISTRY), [], kit.key);
  }
});

test("a film or a play keeps its own name: a kit for one production suggests none", () => {
  for (const key of ["short_film", "documentary", "production", "venue_run"]) assert.equal(starterKit(key)!.prefill.title, undefined, key);
});

test("an example promise is never bigger than the options the organizer goes on to choose", () => {
  for (const kit of STARTER_KITS) {
    assert.match(kit.prefill.sponsor_promise!, /where their sponsorship option says/, kit.key);
    assert.doesNotMatch(kit.prefill.sponsor_promise!, /\bevery\b|\ball\b|always/i, `${kit.key}: no promise of every date`);
  }
  // The two kits that make a film say so where the audience is described. A screening series makes none.
  for (const key of ["short_film", "documentary"]) assert.match(starterKit(key)!.prefill.audience_description!, /No distribution is promised\./, key);
});

// ---------------------------------------------------------------
// Applying a kit
// ---------------------------------------------------------------

test("applying a kit fills an empty form and says what it filled", () => {
  const applied = applyStarterKit("fund_tour", { category_key: "", title: "" }, REGISTRY);
  assert.ok(applied.ok);
  assert.equal(applied.values.category_key, "music");
  assert.equal(applied.values.kind, "tour");
  assert.equal(applied.values.activity_mode, "in_person");
  assert.equal(applied.values.title, "Upcoming tour");
  assert.equal(applied.values.purpose, starterKit("fund_tour")!.prefill.purpose);
  assert.deepEqual(applied.kit, { key: "fund_tour", version: 1 });
  assert.deepEqual(applied.filled, ["category_key", "title", "purpose", "audience_description", "sponsor_promise", "kind", "activity_mode"]);

  const rest = { category_key: "", goal_amount: "", starts_on: "", show_count: "" };
  const untouched = applyStarterKit("fund_tour", rest, REGISTRY);
  assert.ok(untouched.ok);
  assert.deepEqual([untouched.values.goal_amount, untouched.values.starts_on, untouched.values.show_count], ["", "", ""], "a field a kit knows nothing about passes through");

  const film = applyStarterKit("screening_series", {}, REGISTRY);
  assert.ok(film.ok);
  assert.deepEqual(film.values.category_details, { production_stage: "screenings" });
  assert.deepEqual(film.filled, ["category_key", "title", "purpose", "audience_description", "sponsor_promise", "detail_production_stage"]);
});

test("applying a kit never changes what it was given", () => {
  const saved = deepFreeze({ id: "draft-1", category_key: "film", title: "The Ferry", purpose: "Color and sound mix.", activity_mode: null, category_details: { production_stage: "post_production" } });
  const before = JSON.stringify(saved);
  const applied = applyStarterKit("documentary", saved, REGISTRY);
  assert.ok(applied.ok);
  assert.equal(JSON.stringify(saved), before, "the saved draft is as it was");
  assert.notEqual(applied.values, saved);
  assert.notEqual(applied.values.category_details, saved.category_details, "the details are a copy too");
  assert.equal(applied.values.id, "draft-1");
  assert.equal(applied.values.purpose, "Color and sound mix.", "the organizer's words stay the organizer's");
});

test("an answer already on the form wins over the kit", () => {
  const typed = { category_key: "film", title: "The Ferry", purpose: "Color and sound.", audience_description: "Festival audiences.", sponsor_promise: "An end credit.", activity_mode: "online", category_details: { format: "Feature" } };
  const applied = applyStarterKit("short_film", typed, REGISTRY);
  assert.ok(applied.ok);
  assert.deepEqual(applied.values, typed, "every answer is the organizer's own");
  assert.deepEqual(applied.filled, []);

  const music = applyStarterKit("fund_residency", { category_key: "music", kind: "season", title: "Thursdays at the Anchor" }, REGISTRY);
  assert.ok(music.ok);
  assert.equal(music.values.kind, "season");
  assert.equal(music.values.title, "Thursdays at the Anchor");
  assert.deepEqual(music.filled, ["purpose", "audience_description", "sponsor_promise", "activity_mode"]);
});

test("a kit from another category is refused, and the draft's category is not switched", () => {
  assert.deepEqual(applyStarterKit("fund_season", { category_key: "theater" }, REGISTRY), { ok: false, error: "category_mismatch" });
  assert.deepEqual(applyStarterKit("fund_everything", {}, REGISTRY), { ok: false, error: "unknown_kit" });
  assert.deepEqual(applyStarterKit("chef_residency", {}, REGISTRY.filter((c) => c.key !== "hospitality")), { ok: false, error: "kit_unavailable" }, "where 0047 is not applied, hospitality cannot start a draft");
  const chef = applyStarterKit("chef_residency", {}, REGISTRY);
  assert.ok(chef.ok);
  assert.deepEqual(chef.values.category_details, { format: "Chef residency" }, "and where it is, the kit sets the program format and no restaurant detail");
  assert.deepEqual(applyStarterKit("fund_tour", {}, []), { ok: false, error: "kit_unavailable" }, "no registry, no kits");
});

test("a detail the registry does not allow is dropped on apply", () => {
  const narrowed = REGISTRY.map((c) => (c.key === "film" ? { ...c, detail_keys: ["production_stage"] } : c));
  const applied = applyStarterKit("short_film", {}, narrowed);
  assert.ok(applied.ok);
  assert.deepEqual(applied.values.category_details, {});
  assert.ok(!applied.filled.some((name) => name.startsWith("detail_")));
});

// ---------------------------------------------------------------
// Words, and what the module may touch
// ---------------------------------------------------------------

test("kit copy follows the voice rules", () => {
  /** Words that belong to music and to nobody else, as tests/category-neutral-copy.test.ts holds them. */
  const MUSIC_ONLY = /musician|\bbands?\b|\bshows?\b|\btours?\b|\bmerch\b|\blogos?\b|\bgigs?\b/i;
  for (const kit of STARTER_KITS) {
    for (const text of words(kit)) {
      assert.doesNotMatch(text, /—|–/, `${kit.key}: no em dashes`);
      assert.doesNotMatch(text, /guarantee|verified|certif|impressions|confirmed by/i, `${kit.key}: no invented proof`);
      if (kit.categoryKey !== "music") assert.doesNotMatch(text, MUSIC_ONLY, `${kit.key}: "${text}" uses music's words`);
    }
  }
  for (const message of Object.values(STARTER_KIT_ERROR_MESSAGE)) assert.match(message, /\.$/);
  assert.ok(read("tests/vocabulary.test.ts").includes('"src/lib/starter-kits.ts"'), "the retired-word sweep reads the kits");
});

test("the module is pure, creates nothing, and stays apart from the template system", () => {
  const source = read("src/lib/starter-kits.ts");
  const imports = [...source.matchAll(/^import (type )?.*? from "([^"]+)";$/gm)].map((m) => ({ typeOnly: Boolean(m[1]), from: m[2] }));
  assert.deepEqual(imports.filter((i) => !i.typeOnly).map((i) => i.from), ["@/lib/category-words"], "one runtime import: the category wording helper");
  for (const i of imports) assert.doesNotMatch(i.from, /supabase|stripe|actions|opportunity-templates|catalog|sample/, i.from);
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.from\(|\.insert\(|\.update\(|\.rpc\(|fetch\(|checkout|"use server"/i, "no reads, no writes, no payments");
  for (const file of ["src/lib/opportunity-templates.ts", "src/lib/opportunities.ts", "src/lib/catalog.ts"]) {
    assert.doesNotMatch(read(file), /starter-kits/, `${file} does not know about kits`);
  }
});
