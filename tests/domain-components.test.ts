/*
  The semantic domain components, rendered for every starting category.

  Three things are held here. Every component renders, to real markup, for music, sports, film and
  theater, and for a fifth category nobody has written a word of TypeScript for. None of them says
  something about music to somebody who is not music. And none of them can reach the database,
  start a payment or import the music catalog, which is what lets a redesign replace them freely:
  the boundary is checked from their source, not taken on trust.

  The markup is asserted for meaning, never for class names. A redesign is supposed to change those.
*/
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import * as Domain from "@/components/domain";
import { PlacementVerification } from "@/components/PlacementVerification";
import { categoryLabel, categoryWords } from "@/lib/category-words";
import { locationText } from "@/lib/domain";
import { DOMAIN_FIXTURES, FIFTH_CATEGORY_FIXTURE, type DomainFixture } from "@/lib/fixtures/domain-fixtures";

const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "src/components/domain");
const html = (el: ReactElement) => renderToStaticMarkup(el);
/** What a reader sees: tags out, entities back, whitespace settled. */
const text = (el: ReactElement) => html(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&middot;|·/g, "·").replace(/\s+/g, " ").trim();

const EXPECTED = ["AudienceSummary", "CategoryBadge", "DeliveryCommitment", "EvidenceSummary", "FundingPurpose", "FundraiserHeader", "FundraiserStatus", "LocationSummary", "OpportunityCard", "OpportunityEditor", "OrganizerProfileHeader", "PatronActivityItem", "SponsorProfileCard", "SponsorPromise"];

/** Every component, for one fixture. The whole of what a page in this category could draw. */
function everything(f: DomainFixture): ReactElement[] {
  const draft = { on: true, count: "1", price: "", saleMethod: "fixed" as const, buyNow: "", reach: "", reachBasis: "" };
  return [
    createElement(Domain.OrganizerProfileHeader, { organizer: f.organizer, categories: [f.category] }),
    createElement(Domain.FundraiserHeader, { fundraiser: f.fundraiser, organizerName: f.organizer.name }),
    createElement(Domain.CategoryBadge, { category: f.category }),
    createElement(Domain.FundingPurpose, null, f.fundraiser.purpose),
    createElement(Domain.AudienceSummary, null, f.fundraiser.audience),
    createElement(Domain.SponsorPromise, null, f.fundraiser.sponsorPromise),
    ...f.opportunities.map((o) => createElement(Domain.OpportunityCard, { opportunity: o, action: createElement("button", { type: "button" }, "Sponsor this") })),
    ...f.templates.map((t) => createElement(Domain.OpportunityEditor, { template: t, value: draft, onChange: () => {} })),
    createElement(Domain.DeliveryCommitment, { commitments: f.commitments, organizerName: f.organizer.name, fundraiserTitle: f.fundraiser.title, category: f.category, kind: f.fundraiser.kind }),
    createElement(Domain.EvidenceSummary, { evidence: f.evidence, organizerName: f.organizer.name }),
    createElement(Domain.SponsorProfileCard, { sponsor: f.sponsor }),
    createElement("ul", null, createElement(Domain.PatronActivityItem, { item: f.activity })),
    createElement(Domain.LocationSummary, { locations: f.fundraiser.locations, activityMode: f.fundraiser.activityMode }),
    createElement(Domain.FundraiserStatus, { status: f.fundraiser.status }),
  ];
}

test("the fourteen components all exist, and nothing else is exported beside them", () => {
  assert.deepEqual(Object.keys(Domain).sort(), EXPECTED);
});

for (const [key, fixture] of Object.entries(DOMAIN_FIXTURES)) {
  test(`every component renders for ${key}`, () => {
    const page = everything(fixture).map(text).join("\n");
    for (const must of [fixture.organizer.name, fixture.fundraiser.title, fixture.fundraiser.purpose!, fixture.fundraiser.audience!, fixture.fundraiser.sponsorPromise!, fixture.opportunities[0].name, fixture.templates[0].name, fixture.sponsor.displayName, categoryLabel(fixture.category)]) {
      assert.ok(page.includes(must), `${key}: "${must}" is on the page`);
    }
    assert.doesNotMatch(page, /undefined|null|NaN|\[object/, `${key}: nothing unknown was printed as though it were known`);
  });
}

test("nobody outside music is told about music", () => {
  for (const key of ["sports", "film", "theater"] as const) {
    const page = everything(DOMAIN_FIXTURES[key]).map(text).join("\n");
    assert.doesNotMatch(page, /musician|\bband\b|\bshows?\b|\btour\b|\blogos?\b|merch|New York|Brooklyn/i, key);
    assert.doesNotMatch(page, /\bboard\b|\bruns?\b|the act\b/i, `${key}: no retired word either`);
  }
});

test("music keeps music's words", () => {
  const f = DOMAIN_FIXTURES.music;
  const commitment = text(createElement(Domain.DeliveryCommitment, { commitments: f.commitments, organizerName: f.organizer.name, fundraiserTitle: f.fundraiser.title, category: f.category, kind: "tour" }));
  assert.match(commitment, /Low Tide Choir will document where the logos appeared during Autumn tour/);
  assert.match(commitment, /Documentation comes from the musician and appears in the Door Money record/);
  assert.match(text(createElement(Domain.FundraiserHeader, { fundraiser: f.fundraiser })), /14 shows, Oct 2 to Nov 1/);
});

test("the existing verification block renders exactly what it did for music, through the new component", () => {
  const out = text(createElement(PlacementVerification, { actName: "Gutter Hymns", runTitle: "Fall run", categoryKey: "music", verification: { methods: ["end_of_run_record"], other: null } }));
  assert.match(out, /^Placement verification How the placements will be recorded Gutter Hymns will document where the logos appeared during Fall run\. Sponsors receive a record once it ends\./);
  assert.match(out, /Documentation comes from the musician and appears in the Door Money record\.$/);
  const theater = text(createElement(PlacementVerification, { actName: "The Attic Company", runTitle: "A Number", categoryKey: "theater", verification: { methods: ["end_of_run_record"], other: null } }));
  assert.match(theater, /will document where the sponsors appeared during A Number/);
  assert.match(theater, /Documentation comes from the theater company/);
  assert.doesNotMatch(theater, /musician|logo/i, "which is the sentence that used to tell a theater sponsor about a musician's logos");
  assert.equal(html(createElement(PlacementVerification, { actName: "X", runTitle: "Y", categoryKey: "film", verification: { methods: [], other: null } })), "", "and nothing chosen still renders nothing");
});

test("a fifth category is data: it renders with no words written for it", () => {
  const page = everything(FIFTH_CATEGORY_FIXTURE).map(text).join("\n");
  assert.match(page, /Community dance/, "its badge is its key, tidied, until the registry names it");
  assert.doesNotMatch(page, /undefined|null|musician|logo/i);
  assert.equal(categoryWords("community_dance").organizer, "organizer");
  assert.equal(categoryWords("community_dance").fundraiser, "fundraiser");
});

test("what is not known is not drawn", () => {
  assert.equal(html(createElement(Domain.FundingPurpose, null, null)), "");
  assert.equal(html(createElement(Domain.AudienceSummary, null, "   ")), "");
  assert.equal(html(createElement(Domain.LocationSummary, { locations: [null, {}] })), "", "no place is a fact, not a gap to fill");
  assert.equal(html(createElement(Domain.EvidenceSummary, { evidence: { items: [], withheld: 0 }, organizerName: "X" })), "");
  assert.equal(locationText({ region: "Cambridgeshire", countryCode: "GB" }), "Cambridgeshire, GB", "a side with no city gets no city");
  const film = text(createElement(Domain.OrganizerProfileHeader, { organizer: DOMAIN_FIXTURES.film.organizer, categories: [] }));
  assert.doesNotMatch(film, /,\s*$|New York/);
  assert.match(text(createElement(Domain.LocationSummary, { locations: [], activityMode: "online" })), /^Online$/, "and online is a place");
});

test("an organizer is named by what they said, then by one agreed category, then neutrally", () => {
  const o = DOMAIN_FIXTURES.theater.organizer; // said nothing about what they are
  const head = (categories: { key: string }[]) => text(createElement(Domain.OrganizerProfileHeader, { organizer: o, categories }));
  assert.match(head([{ key: "theater" }]), /^Theater company /);
  assert.match(head([{ key: "theater" }, { key: "film" }]), /^Organizer /, "raising for a play and a film does not make anybody a filmmaker");
  assert.match(head([]), /^Organizer /);
  assert.match(text(createElement(Domain.OrganizerProfileHeader, { organizer: DOMAIN_FIXTURES.sports.organizer, categories: [{ key: "film" }] })), /^Team /);
});

test("a card shows the organizer's price and takes no payment of its own", () => {
  const bid = DOMAIN_FIXTURES.music.opportunities[1];
  const card = text(createElement(Domain.OpportunityCard, { opportunity: bid }));
  assert.match(card, /\$340 Top bid/);
  assert.match(card, /Or \$600 to take it now/);
  assert.match(card, /Open to bids/);
  const sold = text(createElement(Domain.OpportunityCard, { opportunity: DOMAIN_FIXTURES.sports.opportunities[0], action: createElement("button", null, "Sponsor this") }));
  assert.match(sold, /Taken by Ouse Valley Physio/);
  assert.doesNotMatch(sold, /Sponsor this/, "a taken option offers nothing to press");
  assert.doesNotMatch(html(createElement(Domain.OpportunityCard, { opportunity: bid })), /<form|<button|checkout|stripe/i, "with no action handed in there is nothing to press at all");
});

test("an editor row suggests a price only where there is one, and keeps the field names the save action reads", () => {
  const draft = { on: true, count: "2", price: "450", saleMethod: "auction" as const, buyNow: "900", reach: "", reachBasis: "" };
  const music = html(createElement(Domain.OpportunityEditor, { template: DOMAIN_FIXTURES.music.templates[0], value: draft, onChange: () => {} }));
  assert.match(music, /Suggested price \$500 per run/);
  for (const name of ["on_merch_runner", "count_merch_runner", "price_merch_runner", "mode_merch_runner", "buynow_merch_runner"]) assert.ok(music.includes(`name="${name}"`), name);
  const theater = text(createElement(Domain.OpportunityEditor, { template: DOMAIN_FIXTURES.theater.templates[0], value: { ...draft, price: "" }, onChange: () => {} }));
  assert.doesNotMatch(theater, /Suggested price|Seen by|\$/, "no invented price, and no 'seen by' for a template that has none");
});

test("evidence is what the viewer was handed, plus a count, and says who supplied it", () => {
  const sports = text(createElement(Domain.EvidenceSummary, { evidence: DOMAIN_FIXTURES.sports.evidence, organizerName: "Fenland Rovers" }));
  assert.match(sports, /2 more items are private to the sponsor and to Fenland Rovers/);
  assert.match(sports, /Documentation comes from Fenland Rovers, and Door Money passes it on/);
  const film = text(createElement(Domain.EvidenceSummary, { evidence: DOMAIN_FIXTURES.film.evidence, organizerName: "Slow River Films" }));
  assert.match(film, /Private End credit, locked cut/);
  assert.doesNotMatch(sports + film, /verified|confirmed|certif|inspected/i);
});

test("a patron's activity keeps a sponsorship and a backing apart, and names the fundraiser's own category", () => {
  assert.match(text(createElement("ul", null, createElement(Domain.PatronActivityItem, { item: DOMAIN_FIXTURES.music.activity }))), /Backing · Music · October 2026$/);
  assert.match(text(createElement("ul", null, createElement(Domain.PatronActivityItem, { item: DOMAIN_FIXTURES.sports.activity }))), /Sponsorship · Sports teams · March 2027$/);
  assert.match(text(createElement("ul", null, createElement(Domain.PatronActivityItem, { item: DOMAIN_FIXTURES.theater.activity }))), /Sponsorship · November 2026$/, "with no category known, none is claimed");
  const card = text(createElement(Domain.SponsorProfileCard, { sponsor: DOMAIN_FIXTURES.film.sponsor }));
  assert.match(card, /Marisol Okafor/);
  assert.match(card, /Film Theater/, "a patron supports more than one category");
  assert.doesNotMatch(card, /Individual|Business|\$/, "an individual who said nothing about themselves is not labelled, and no amount exists to show");
});

// ---------------------------------------------------------------
// The boundary
// ---------------------------------------------------------------

const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

test("no domain component can reach the database, start a payment, or call the server", () => {
  assert.ok(files.length >= 12);
  for (const file of files) {
    const source = readFileSync(path.join(DIR, file), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    for (const spec of imports) {
      assert.doesNotMatch(spec, /supabase|stripe|@\/app\/|\/actions\/|@\/lib\/(auth|boards|purchases|backings|refunds|release|auctions|email|outbox|weekly|patronprofile)\b/, `${file} imports ${spec}`);
    }
    assert.doesNotMatch(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), /"use server"|\bfetch\(|process\.env|payment_intent|client_secret|fee_cents|feePercent|\.from\("/, `${file} holds no payment or database logic`);
  }
});

test("no domain component imports the music catalog or a music-only type", () => {
  for (const file of files) {
    const source = readFileSync(path.join(DIR, file), "utf8");
    assert.doesNotMatch(source, /@\/lib\/catalog|@\/lib\/sample|ActType|MusicSurface|MusicGroup|SurfaceGroup|WIDGET_TIERS/, file);
  }
  const contracts = readFileSync(path.join(ROOT, "src/lib/domain.ts"), "utf8") + readFileSync(path.join(ROOT, "src/lib/fixtures/domain-fixtures.ts"), "utf8");
  assert.doesNotMatch(contracts, /from "@\/lib\/(catalog|sample|supabase|stripe)/, "and neither do the contracts or the fixtures");
});

test("no domain component writes a category's noun by hand", () => {
  // Words come from src/lib/category-words.ts. A literal here is how "musician" got onto a theater page.
  for (const file of files) {
    const prose = readFileSync(path.join(DIR, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(prose, /musician|filmmaker|theater company|\bband\b|\btour\b|\blogos?\b|\bshows?\b|New York/i, file);
  }
});

test("the domain contracts carry nothing a component could leak or charge with", () => {
  const types = readFileSync(path.join(ROOT, "src/lib/domain.ts"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.doesNotMatch(types, /email|stripe|payment_status|paymentStatus|owner_id|ownerId|feeCents|fee_cents|patron_id|profile_id|storage_path|storagePath/i);
});
