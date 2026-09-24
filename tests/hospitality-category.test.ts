/*
  Hospitality: a category that can hold a private draft, and nothing else.

  The database holds the gates, and supabase/tests/hospitality_draft_only_test.sql asks them there,
  where the triggers and policies actually run. This file holds the rest: the words the category
  uses, what its six templates say about the kind of sponsorship each one is, and the answer the
  application's own payment gate gives before the database is ever asked. It also reads the two
  migrations, so that opening hospitality can only happen in a file that says so.
*/
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOG, GROUPS, surfacesForCategory } from "@/lib/catalog";
import { detailFields, detailValueErrors, organizerLabel, organizerNoun, organizerNounCounted, titleLabel } from "@/lib/categories";
import { categoryLabel, categoryWords } from "@/lib/category-words";
import { OpportunityEditor } from "@/components/domain/OpportunityEditor";
import { catalogTemplates, templateFitsFundraiser, templateSections, templatesForFundraiser } from "@/lib/opportunities";
import { CATEGORY_PAYMENTS_CLOSED, paymentsOpenFor } from "@/lib/payment-gate";
import { publishBlockers } from "@/lib/readiness";
import { IN_KIND_NOTE, SPONSORSHIP_KINDS, hasInKind, sponsorshipKindLabels, type SponsorshipKind } from "@/lib/sponsorship-kinds";
import { STARTING_CATEGORIES } from "@/lib/starting-categories";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const sql = (file: string) => read(file).replace(/--.*$/gm, "");
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const HOSPITALITY = CATALOG.filter((s) => s.category === "hospitality");
const DETAIL_KEYS = ["venue_kind", "format"];

// ---------------------------------------------------------------
// The migration says draft-only, and nothing else says otherwise
// ---------------------------------------------------------------

test("migration 0047 adds the category for drafts, with publishing written out as off", () => {
  const m = sql("supabase/migrations/0047_hospitality_draft_category.sql");
  assert.match(m, /\('hospitality', 'Hospitality', array\['venue_kind','format'\], true, false\)/);
  assert.doesNotMatch(m, /publish_enabled\s*=\s*true/i);
  assert.doesNotMatch(m, /insert into (?:public\.)?delivery_policies/i, "no delivery policy: that row is what would let one be bought");
  assert.doesNotMatch(m, /\bgrant\b/i, "rows only: nothing new is opened to the browser");
  assert.match(m, /hospitality is already enabled for publishing/, "and it refuses to finish over a row that can publish");
  assert.match(m, /hospitality already has a delivery policy/);
});

test("no other migration opens it: every file that names hospitality leaves publishing off and adds no policy", () => {
  // A property over the whole folder, not a list of file names: a new migration that mentions
  // hospitality in a comment or a guard should not need this test edited, and one that opens it
  // should fail here whatever it is called. Opening hospitality takes a policy row and
  // publish_enabled, each in a migration that does nothing else (CLAUDE.md, the hospitality rule).
  const dir = path.join(ROOT, "supabase/migrations");
  const naming = readdirSync(dir).filter((f) => f.endsWith(".sql") && /hospitality/i.test(read(`supabase/migrations/${f}`))).sort();
  assert.ok(naming.includes("0047_hospitality_draft_category.sql"), "0047 is the one that adds it");
  for (const file of naming) {
    const statements = sql(`supabase/migrations/${file}`).split(";");
    for (const statement of statements) {
      if (!/hospitality/i.test(statement)) continue;
      assert.doesNotMatch(statement, /publish_enabled\s*=\s*true/i, `${file} enables publishing in a statement that names hospitality`);
      assert.doesNotMatch(statement, /insert into (?:public\.)?delivery_policies/i, `${file} gives hospitality a delivery policy`);
      assert.doesNotMatch(statement, /\('hospitality',[^)]*true,\s*true\)/i, `${file} seeds hospitality with publishing on`);
    }
  }
  // 0053 names it to scope one discovery tag to hospitality, which opens nothing, and to assert in
  // the migration itself that it left publishing and the delivery policy exactly as it found them.
  // 0054 only widens the two discovery views with columns anon could already read, and names
  // hospitality solely in the same guard. Both files are held to it.
  for (const file of ["0053_discovery_contract.sql", "0054_discovery_read_model.sql"]) {
    const discovery = sql(`supabase/migrations/${file}`);
    assert.doesNotMatch(discovery, /publish_enabled\s*=\s*true/i, file);
    assert.doesNotMatch(discovery, /insert into (?:public\.)?(?:delivery_policies|fundraiser_categories)/i, file);
    assert.match(discovery, /must not enable publishing for a draft-only category/, `${file} stops if a draft-only category can publish`);
  }
  // 0050 lets a patron say they support it, on a switch of its own. It opens nothing: no publishing, no policy, no template.
  const preference = sql("supabase/migrations/0050_patron_profile_customization.sql");
  assert.match(preference, /set preference_enabled = true where publish_enabled or key = 'hospitality'/);
  assert.doesNotMatch(preference, /publish_enabled\s*=\s*true/i);
  assert.doesNotMatch(preference, /insert into (?:public\.)?(?:delivery_policies|surfaces)/i);
  assert.match(preference, /a draft-only category can publish/, "and it stops if a draft-only category can");
  // 0049 changes the label and nothing else about it: same key, no publishing, no policy, and it stops if either is there.
  const name = sql("supabase/migrations/0049_restaurants_and_other_categories.sql");
  assert.match(name, /set label = 'Restaurants & hospitality'\s+where key = 'hospitality' and label = 'Hospitality'/);
  assert.doesNotMatch(name, /'restaurants'/, "no second key: that would split the templates, the words and the future policy");
  assert.doesNotMatch(name, /publish_enabled\s*=\s*true/i);
  assert.doesNotMatch(name, /insert into (?:public\.)?(?:delivery_policies|surfaces)/i);
  assert.match(name, /hospitality or other is already enabled for publishing/);
  assert.match(name, /hospitality or other already has a delivery policy/);
  const fix = sql("supabase/migrations/0048_draft_options_are_private.sql");
  assert.doesNotMatch(fix, /hospitality/i, "0048 names it in a comment only: the rule is for every category");
  assert.match(fix, /status <> 'draft'/);
  assert.match(fix, /create policy "public read lots" on public\.lots for select to anon, authenticated\s+using \(public\.run_has_left_draft\(run_id\)\)/);
});

test("hospitality is a starting category since 2026-09-21, and being listed opens nothing", () => {
  assert.deepEqual(STARTING_CATEGORIES.map((c) => c.key), ["music", "sports", "film", "theater", "hospitality", "digital_workers", "other"]);
  assert.equal(STARTING_CATEGORIES.find((c) => c.key === "hospitality")!.label, "Restaurants & hospitality");
  assert.doesNotMatch(read("src/lib/starting-categories.ts"), /key: "restaurants"/);
  // The patron-side pickers read the registry's own preference switch (migration 0050), in both places, and never
  // publish_enabled: a patron can say they support restaurants while no hospitality fundraiser can be published.
  assert.match(read("src/app/dashboard/profile/patron/page.tsx"), /from\("fundraiser_categories"\)\.select\("key,label"\)\.eq\("preference_enabled", true\)/);
  assert.match(read("src/app/actions/profile.ts"), /from\("fundraiser_categories"\)\.select\("key"\)\.eq\("preference_enabled", true\)/);
  for (const file of ["src/app/dashboard/profile/patron/page.tsx", "src/app/actions/profile.ts"]) assert.doesNotMatch(read(file), /\.eq\("publish_enabled"/, `${file} asks the preference switch`);
});

// ---------------------------------------------------------------
// The words
// ---------------------------------------------------------------

test("the organizer is a hospitality venue, because a restaurant is one kind and not the only one", () => {
  assert.equal(organizerNoun("hospitality"), "hospitality venue");
  assert.equal(organizerNounCounted("hospitality", 1), "hospitality venue");
  assert.equal(organizerNounCounted("hospitality", 3), "hospitality venues");
  assert.equal(titleLabel("hospitality"), "Program or experience name");
  assert.equal(organizerLabel("hospitality", null, null), "Hospitality venue", "and no city is invented");
  assert.equal(organizerLabel("hospitality", null, "Lisbon"), "Hospitality venue, Lisbon");
  const words = categoryWords("hospitality");
  assert.deepEqual([words.organizer, words.fundraiser, words.materials, words.appearances], ["hospitality venue", "fundraiser", "materials", "sponsors"], "nothing of music's: no tour, no logo");
  assert.equal(categoryLabel({ key: "hospitality", label: "Restaurants & hospitality" }), "Restaurants & hospitality", "the name is the registry's, whatever it says");
});

test("the category language covers the six things asked for", () => {
  const spoken = [...detailFields("hospitality", DETAIL_KEYS).flatMap((f) => [f.label, f.help ?? "", f.placeholder ?? ""]), ...HOSPITALITY.map((s) => s.name)].join(" ").toLowerCase();
  for (const phrase of ["restaurant", "dinner series", "chef residency", "sponsored experience", "community meal program"]) assert.ok(spoken.includes(phrase), phrase);
  assert.ok(organizerNoun("hospitality").includes("hospitality venue"));
});

test("both details are free text, optional, and neither assumes a restaurant", () => {
  const fields = detailFields("hospitality", DETAIL_KEYS);
  assert.deepEqual(fields.map((f) => f.key), DETAIL_KEYS);
  for (const f of fields) assert.equal(f.options, undefined, `${f.key}: a closed list would become a limit on who can raise money here`);
  assert.match(fields[0].help!, /a bar, a hotel, a caterer, a community kitchen\. Leave it empty if none fits\./);
  assert.deepEqual(detailValueErrors("hospitality", {}, DETAIL_KEYS), [], "nothing is required");
  assert.deepEqual(detailValueErrors("hospitality", { venue_kind: "Hotel bar", format: "Tasting evenings" }, DETAIL_KEYS), [], "and an answer nobody listed is fine");
  for (const f of fields) assert.doesNotMatch(`${f.label} ${f.help}`, /cuisine|covers|seats|liquor|license|michelin/i, `${f.key}: not a restaurant form`);
});

// ---------------------------------------------------------------
// The templates
// ---------------------------------------------------------------

test("the six templates exist, belong to hospitality, and suggest no price", () => {
  assert.deepEqual(HOSPITALITY.map((s) => s.key), ["sponsored_martini_cart", "sponsored_table_plaque", "sponsored_restaurant_space", "chef_residency", "dinner_series", "community_meal_program"]);
  for (const s of HOSPITALITY) {
    assert.equal(s.defaultPriceCents, null, `${s.key}: Door Money has sold none of these`);
    assert.equal(s.appliesTo, null, `${s.key}: an act type is a music idea`);
    assert.ok(s.group in GROUPS, `${s.key}: its section has a heading`);
  }
  assert.deepEqual(surfacesForCategory("hospitality", null).map((s) => s.key), HOSPITALITY.map((s) => s.key));
});

test("hospitality templates stay on hospitality fundraisers, and nobody else's reach one", () => {
  const all = catalogTemplates();
  const offered = templatesForFundraiser(all, "hospitality", null);
  assert.equal(offered.length, 6);
  assert.ok(offered.every((t) => t.category === "hospitality" && t.defaultPriceCents === null));
  for (const other of ["music", "sports", "film", "theater"]) {
    assert.ok(templatesForFundraiser(all, other, other === "music" ? "touring_band" : null).every((t) => t.category !== "hospitality"), other);
    assert.equal(templateFitsFundraiser(offered[0], other), false, other);
  }
  assert.deepEqual(templateSections(offered).map((s) => s.eyebrow), ["Branded guest experience", "Venue or space", "Events", "Community"]);
});

test("every template says what kind of sponsorship it is, and the six kinds are all used", () => {
  const used = new Set<SponsorshipKind>();
  for (const s of HOSPITALITY) {
    assert.ok(s.kinds && s.kinds.length > 0, `${s.key}: says what kind it is`);
    assert.ok(s.kinds.includes("cash"), `${s.key}: Door Money moves money, so cash is always one of them`);
    s.kinds.forEach((k) => used.add(k));
    assert.match(s.blurb, /A cash sponsorship/, `${s.key}: says what the money pays for`);
  }
  assert.deepEqual([...used].sort(), (Object.keys(SPONSORSHIP_KINDS) as SponsorshipKind[]).sort());
  assert.deepEqual(Object.values(SPONSORSHIP_KINDS).map((k) => k.label), [
    "Cash sponsorship", "Product or beverage sponsorship", "Service sponsorship", "Venue or space sponsorship", "Event sponsorship", "Branded guest experience",
  ]);
  // Music, sports, film and theater say nothing here, and are drawn exactly as before.
  for (const s of CATALOG.filter((x) => x.category !== "hospitality")) assert.equal(s.kinds, undefined, s.key);
});

test("product and services are never described as something a sponsor buys through Door Money", () => {
  for (const s of HOSPITALITY.filter((x) => hasInKind(x.kinds))) {
    assert.match(s.blurb, /agree between them|agreed with the venue/, `${s.key}: in-kind is between the venue and the sponsor`);
  }
  assert.match(IN_KIND_NOTE, /Door Money handles the payment and nothing else\./);
  assert.equal(hasInKind(["space", "cash"]), false);
  assert.equal(hasInKind(["event", "cash", "service"]), true);
  assert.deepEqual(sponsorshipKindLabels(null), []);
  for (const s of HOSPITALITY) assert.doesNotMatch(`${s.blurb} ${s.seenBy}`, /—|guarantee|verified|certif|impressions|[$£€]\d/, s.key);
  assert.match(HOSPITALITY.find((s) => s.key === "community_meal_program")!.blurb, /Nobody who receives a meal is photographed or named for a sponsor\./);
  assert.match(HOSPITALITY.find((s) => s.key === "sponsored_martini_cart")!.blurb, /The venue confirms what its license allows\./);
});

test("the options editor draws the kinds from its view, and draws nothing for a template that has none", () => {
  const draft = { on: true, count: "1", price: "", saleMethod: "fixed" as const, buyNow: "", reach: "", reachBasis: "" };
  const cart = HOSPITALITY[0];
  const view = { key: cart.key, name: cart.name, seenBy: cart.seenBy, suggestedPriceCents: null, period: cart.period, kindLabels: sponsorshipKindLabels(cart.kinds), kindNote: hasInKind(cart.kinds) ? IN_KIND_NOTE : null };
  const out = text(renderToStaticMarkup(createElement(OpportunityEditor, { template: view, value: draft, onChange: () => {} })));
  assert.ok(out.includes("Branded guest experience, Product or beverage sponsorship, Cash sponsorship."));
  assert.ok(out.includes(IN_KIND_NOTE));
  assert.doesNotMatch(out, /Suggested price/, "no price is suggested");
  const plain = text(renderToStaticMarkup(createElement(OpportunityEditor, { template: { key: "jersey_front", name: "Jersey front", seenBy: null, suggestedPriceCents: null, period: "season" }, value: draft, onChange: () => {} })));
  assert.doesNotMatch(plain, /sponsorship\.|Door Money handles/);
  // The domain component is handed words. It imports neither the kinds nor the catalog.
  assert.doesNotMatch(read("src/components/domain/OpportunityEditor.tsx"), /sponsorship-kinds|catalog/);
});

// ---------------------------------------------------------------
// It cannot be published, and it cannot be bought
// ---------------------------------------------------------------

test("the readiness checklist tells a hospitality organizer publishing is not open, and the editor offers no publish button", () => {
  const complete = {
    act: { name: "The Copper Room", city: null, bio: "A dining room on the harbor.", type: null, stripe_payouts_enabled: true },
    run: { category_key: "hospitality", title: "Martini cart", purpose: "The cart.", audience_description: "Guests.", sponsor_promise: "A name on the cart.", kind: null, starts_on: null, ends_on: null, show_count: null, bidding_closes_at: null, methods: ["photos"], other: null },
    lotCount: 1, auctionCount: 0, incompleteOffers: [],
  };
  const blockers = publishBlockers({ ...complete, categoryPublishable: false } as never);
  assert.ok(blockers.includes("This category can hold drafts. Publishing is not open for it yet."));
  const editor = read("src/components/LotsEditor.tsx");
  assert.match(editor, /runStatus === "draft" && !publishable \?/);
  assert.match(editor, /has not opened this category for publishing or payments yet/);
  assert.match(read("src/app/dashboard/runs/[id]/page.tsx"), /publishable=\{categoryPublishable\}/, "from the registry, never from a list in code");
  // The action asks the registry too, whatever the page drew.
  assert.match(read("src/app/actions/run.ts"), /categoryPublishable: \(await categoryStatus\(run\.category_key \?\? "music"\)\)\.publishEnabled/);
});

/** A delivery_policies read that answers with these rows, the way PostgREST would. */
const policies = (rows: { version: number; status: string }[] | null, error: unknown = null) =>
  ({ from: () => ({ select: () => ({ eq: async () => ({ data: rows, error }) }) }) }) as unknown as SupabaseClient;

test("the payment gate answers no for hospitality in test mode and in live mode", async () => {
  // No policy row is what migration 0047 leaves, and what the checkout and bid routes read first.
  assert.equal(await paymentsOpenFor(policies([]), "hospitality", false), false, "test mode");
  assert.equal(await paymentsOpenFor(policies([]), "hospitality", true), false, "live mode");
  // The same read, for the categories that do have one, to show the mock is asking a real question.
  assert.equal(await paymentsOpenFor(policies([{ version: 1, status: "proposed" }]), "theater", false), true);
  assert.equal(await paymentsOpenFor(policies([{ version: 1, status: "proposed" }]), "theater", true), false);
  assert.equal(await paymentsOpenFor(policies([{ version: 1, status: "active" }]), "music", true), true);
  // A retired policy is no policy.
  assert.equal(await paymentsOpenFor(policies([{ version: 1, status: "retired" }]), "hospitality", false), false);
  assert.equal(CATEGORY_PAYMENTS_CLOSED, "Payments are not open for this kind of fundraiser yet.");
});

test("both payment routes ask the gate before anything reaches Stripe, and refuse a fundraiser that is not public", () => {
  const checkout = read("src/app/api/checkout/route.ts");
  const bids = read("src/app/api/bids/setup/route.ts");
  for (const [name, route] of [["checkout", checkout], ["bids", bids]] as const) {
    assert.match(route, /if \(!\(await paymentsOpenFor\(sb, lot\.runs\.category_key\)\)\) return fail\(CATEGORY_PAYMENTS_CLOSED, 403\)/, name);
  }
  assert.match(checkout, /if \(!\["open", "live"\]\.includes\(lot\.runs\.status\)\) return fail\("That fundraiser is closed\.", 400\)/, "a draft is refused before the gate is even asked");
  assert.ok(checkout.indexOf("includes(lot.runs.status)") < checkout.indexOf("paymentsOpenFor(sb, lot.runs.category_key)"), "in that order");
});
