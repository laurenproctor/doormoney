/*
  How an organizer arrives: the organizer page at /list, and the way from it into a new fundraiser.

  Door Money is for any organizer whose work gathers an audience, so the page that invites them
  shows ideas across categories and sends each one into the new fundraiser form on its starter kit.
  Three things are held here. Every idea is a real starter kit, in the category it is listed under.
  An idea only links into the form where the registry has the category: hospitality is shown as an
  example and marked coming soon, and nothing on the page can say otherwise. And the addresses that
  were already out in the world (/list, its #list anchor, the contact keys) still answer.

  Hospitality is in the registry as a draft-only category (migration 0047), so its ideas read
  "Private draft" and link into the form. A database where 0047 is not applied has no such row, and
  there they read "Coming soon" and link nowhere. Both are held here.

  The page reads the database and the session, so it is read from source, the way
  tests/category-neutral-copy.test.ts reads it. The ideas and their links are plain data and are
  tested directly.
*/
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CONTACT_REASON_KEYS } from "@/lib/contact";
import { EXAMPLE_GROUPS, EXAMPLE_STATUS_LABEL, exampleHref, exampleStatus, newFundraiserPath } from "@/lib/organizer-examples";
import { NAV } from "@/lib/site";
import { starterKit, starterKitFromLink, type KitCategory } from "@/lib/starter-kits";

const ROOT = path.join(import.meta.dirname, "..");
const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
/** Source with comments out, so a comment explaining a retired phrase does not trip the rule about it. */
const code = (file: string) => read(file).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** What getCategoryLabels returns before migration 0047 is applied: the four rows 0038 seeded. */
const LABELS = { music: "Music", sports: "Sports teams", film: "Film", theater: "Theater" };
/** And after it: anon may read a category's key and label (0043), so the fifth name arrives with the row. */
const LABELS_0047 = { ...LABELS, hospitality: "Restaurants & hospitality" };
const examples = EXAMPLE_GROUPS.flatMap((g) => g.examples.map((e) => ({ ...e, categoryKey: g.categoryKey })));

/** The safeNext rule from src/lib/auth.ts, which imports the database and so is restated, then checked against its source. */
const safeNext = (next: string) => next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");

// ---------------------------------------------------------------
// The ideas
// ---------------------------------------------------------------

test("the organizer page has ideas for its named categories, in this order", () => {
  assert.deepEqual(EXAMPLE_GROUPS.map((g) => g.categoryKey), ["music", "sports", "film", "theater", "hospitality", "digital_workers"]);
  assert.deepEqual(EXAMPLE_GROUPS.map((g) => g.heading), [
    "Musicians and tours", "Sports teams and tournaments", "Filmmakers and screenings", "Theater productions", "Restaurants & hospitality", "Digital workers and independent projects",
  ]);
});

test("the concrete examples are there, each under the kind of organizer it belongs to", () => {
  const titled = (categoryKey: string, pattern: RegExp) => examples.some((e) => e.categoryKey === categoryKey && pattern.test(e.title));
  assert.ok(titled("music", /sponsor-funded tour/i));
  assert.ok(titled("sports", /jersey or warm-up sponsorship/i));
  assert.ok(titled("film", /end-credit sponsorship/i));
  assert.ok(titled("theater", /program or foyer sponsorship/i), "the catalog calls it a program credit, so the page does too");
  assert.ok(titled("hospitality", /sponsored martini cart/i));
  assert.ok(titled("hospitality", /branded table plaque/i));
  assert.ok(titled("hospitality", /chef residency/i));
  assert.ok(titled("hospitality", /sponsored dinner series/i));
  assert.ok(titled("digital_workers", /independent project/i));
  assert.ok(titled("digital_workers", /digital product/i));
});

test("every idea is a real starter kit in the category it is listed under, and no kit is listed twice", () => {
  for (const e of examples) {
    const kit = starterKit(e.kitKey);
    assert.ok(kit, `${e.kitKey} is not a starter kit`);
    assert.equal(kit.categoryKey, e.categoryKey, `${e.kitKey} belongs to ${kit.categoryKey}`);
  }
  assert.equal(new Set(examples.map((e) => e.kitKey)).size, examples.length);
});

test("an idea is a possibility in plain words: no number, no guarantee, no music word outside music", () => {
  const MUSIC_ONLY = /musician|\bbands?\b|\bshows?\b|\btours?\b|\bmerch\b|\blogos?\b|\bgigs?\b/i;
  for (const e of examples) {
    for (const text of [e.title, e.line]) {
      assert.doesNotMatch(text, /—|–/, `${e.kitKey}: no em dashes`);
      assert.doesNotMatch(text, /[$£€]|\d/, `${e.kitKey}: no price and no count`);
      assert.doesNotMatch(text, /guarantee|verified|certif|impressions|\bevery\b|\balways\b/i, `${e.kitKey}: no invented proof`);
      assert.doesNotMatch(text, /\byou\b|\byour\b/i, `${e.kitKey}: an idea names its sides, since a sponsor could be reading`);
      if (e.categoryKey !== "music") assert.doesNotMatch(text, MUSIC_ONLY, `${e.kitKey}: "${text}"`);
    }
    assert.match(e.line, /\.$/);
  }
});

// ---------------------------------------------------------------
// Where an idea leads
// ---------------------------------------------------------------

test("an idea in one of Door Money's categories opens the new fundraiser form on its starter kit", () => {
  for (const e of examples.filter((x) => ["music", "sports", "film", "theater"].includes(x.categoryKey))) {
    const status = exampleStatus(starterKit(e.kitKey)!, LABELS);
    assert.equal(status, "open", e.kitKey);
    assert.equal(exampleHref(e.kitKey, status, true), `/dashboard/runs/new?template=${e.kitKey}`);
  }
  assert.equal(newFundraiserPath("fund_tour"), "/dashboard/runs/new?template=fund_tour");
  assert.equal(newFundraiserPath(), "/dashboard/runs/new");
  for (const bad of ["fund_everything", "//evil.example", "fund_tour&next=//evil.example", ""]) {
    assert.equal(newFundraiserPath(bad), "/dashboard/runs/new", `${bad}: only a real kit's key is written into an address`);
  }
});

test("a visitor with no account signs up first and lands on the same kit", () => {
  const href = exampleHref("fund_season", "open", false)!;
  // The intent says which side of the market sent them, so the dashboard can lead with the right
  // action afterwards. It is context, never permission: the account it opens can do both.
  assert.equal(href, "/signup?intent=creator&next=%2Fdashboard%2Fruns%2Fnew%3Ftemplate%3Dfund_season");
  const next = new URL(href, "https://doormoney.test").searchParams.get("next")!;
  assert.equal(next, "/dashboard/runs/new?template=fund_season");
  assert.ok(safeNext(next), "and sign-up will accept it as a path inside the site");
  assert.match(read("src/lib/auth.ts"), /!next\.startsWith\("\/"\) \|\| next\.startsWith\("\/\/"\) \|\| next\.startsWith\("\/\\\\"\)/, "the rule restated above is still the rule");
  // The callback after an emailed confirmation keeps the query string. `destination` is `next`
  // itself, or the two-factor screen carrying `next`, so the kit survives either way.
  assert.match(read("src/app/actions/auth.ts"), /auth\/callback\?next=\$\{encodeURIComponent\(next\)\}/);
  const callback = read("src/app/auth/callback/route.ts");
  assert.match(callback, /let destination = next;/);
  assert.match(callback, /destination = mfaVerifyPath\(next\)/, "and the code screen is handed the same destination");
  assert.match(callback, /new URL\(failed \? dead : destination, url\.origin\)/);
});

test("the kit survives the organizer-profile step a new organizer has to take first", () => {
  assert.match(code("src/app/dashboard/runs/new/page.tsx"), /if \(!act\) redirect\(asked \? `\/dashboard\/act\/new\?template=\$\{asked\}` : "\/dashboard\/act\/new"\)/);
  const profile = code("src/app/dashboard/act/new/page.tsx");
  assert.match(profile, /const kit = typeof template === "string" \? starterKit\(template\) : null/, "looked up, never echoed");
  assert.match(profile, /template=\{kit\?\.key \?\? null\}/);
  assert.match(code("src/components/OrganizerSetup.tsx"), /name="template" value=\{template\}/);
  assert.match(code("src/app/actions/organizer-setup.ts"), /newFundraiserPath\(typeof template === "string" \? template : null\)/);
  assert.match(code("src/app/actions/act.ts"), /redirect\(kit \? newFundraiserPath\(kit\.key\) : "\/dashboard"\)/);
});

// ---------------------------------------------------------------
// Hospitality is an example, not a category
// ---------------------------------------------------------------

test("where 0047 is not applied, hospitality is marked coming soon and has no link into the form, because the form would refuse it", () => {
  const registry: KitCategory[] = Object.entries(LABELS).map(([key, label]) => ({ key, label, detail_keys: [], draft_enabled: true, publish_enabled: true }));
  for (const e of examples.filter((x) => x.categoryKey === "hospitality")) {
    const status = exampleStatus(starterKit(e.kitKey)!, LABELS);
    assert.equal(status, "coming_soon", e.kitKey);
    assert.equal(exampleHref(e.kitKey, status, true), null);
    assert.equal(exampleHref(e.kitKey, status, false), null);
    assert.deepEqual(starterKitFromLink(e.kitKey, registry), { status: "refused", error: "kit_unavailable" }, "and the form agrees");
  }
  assert.equal(EXAMPLE_STATUS_LABEL.coming_soon, "Coming soon");
});

test("a database that answers nothing does not relabel the four starting categories, and opens nothing new", () => {
  assert.equal(exampleStatus(starterKit("fund_tour")!, {}), "open");
  assert.equal(exampleStatus(starterKit("production")!, {}), "open");
  assert.equal(exampleStatus(starterKit("chef_residency")!, {}), "coming_soon");
  assert.equal(exampleStatus(starterKit("start_independent_project")!, {}), "coming_soon");
});

test("with the category in the registry, its ideas link as private drafts, and are never called open", () => {
  for (const e of examples.filter((x) => x.categoryKey === "hospitality")) {
    assert.equal(exampleStatus(starterKit(e.kitKey)!, LABELS_0047), "draft_only", e.kitKey);
  }
  for (const e of examples.filter((x) => ["music", "sports", "film", "theater"].includes(x.categoryKey))) {
    assert.equal(exampleStatus(starterKit(e.kitKey)!, LABELS_0047), "open", `${e.kitKey}: a fifth row changes nothing for the four`);
  }
  const withDigital = { ...LABELS_0047, digital_workers: "Digital workers" };
  for (const e of examples.filter((x) => x.categoryKey === "digital_workers")) {
    assert.equal(exampleStatus(starterKit(e.kitKey)!, withDigital), "draft_only", e.kitKey);
    assert.equal(exampleHref(e.kitKey, "draft_only", true), `/dashboard/runs/new?template=${e.kitKey}`);
  }
  const status = exampleStatus(starterKit("sponsored_martini_cart")!, LABELS_0047);
  assert.equal(status, "draft_only");
  assert.equal(EXAMPLE_STATUS_LABEL.draft_only, "Private draft");
  assert.equal(exampleHref("sponsored_martini_cart", status, true), "/dashboard/runs/new?template=sponsored_martini_cart");
  assert.equal(exampleStatus({ ...starterKit("fund_tour")!, enabled: false }, LABELS), "coming_soon", "a retired kit links nowhere");
});

test("the page takes every status from the registry and hard-codes none", () => {
  const list = code("src/app/list/page.tsx");
  assert.match(list, /exampleStatus\(kit, labels\)/);
  assert.match(list, /exampleHref\(example\.kitKey, status, signedIn\)/);
  assert.doesNotMatch(list, /template=|hospitality|martini|restaurant/i, "no idea and no category is written into the page itself");
  assert.match(list, /has not opened this category/);
  assert.match(list, /None of them\s+can be created, published or paid for today\./);
  assert.match(list, /Example only/);
  assert.match(list, /has opened this category for private drafts only/);
  assert.match(list, /cannot be\s+published or paid for yet\./);
  // Since 2026-09-21 hospitality is a starting category, named in one list and the registry's fallback.
  // The pages that show the set read that list: none of them writes a category of its own.
  for (const file of ["src/app/page.tsx", "src/app/how-sponsorship-works/page.tsx", "src/app/signup/page.tsx"]) {
    assert.doesNotMatch(read(file), /hospitality|restaurant/i, file);
  }
});

// ---------------------------------------------------------------
// The page, and the addresses that were already out there
// ---------------------------------------------------------------

test("/list is still /list, still titled for every organizer, and leads with the new language", () => {
  assert.ok(existsSync(path.join(ROOT, "src/app/list/page.tsx")));
  assert.ok(NAV.some((n) => n.href === "/list" && n.label === "For organizers"));
  const list = code("src/app/list/page.tsx");
  assert.match(list, /title: "Create a fundraiser"/);
  assert.match(list, /current="\/list"/);
  assert.match(list, /<Section id="list">/, "the #list anchor other pages and old emails point at");
  assert.match(list, /<Section id="ideas">/);
  for (const phrase of ["Find sponsors for", "Start with a sponsorship idea", "Choose a starter kit", "Create a fundraiser"]) assert.ok(list.includes(phrase), phrase);
  assert.match(list, /Change any of them\./, "a starter kit is an example the organizer edits");
  assert.match(list, /sets no price/);
  assert.doesNotMatch(list, /List an act|list your act|\bgigs?\b/i);
});

test("the way in goes through the new fundraiser flow, for somebody new and for somebody signed in", () => {
  const list = code("src/app/list/page.tsx");
  assert.match(list, /const startHref = signedIn \? newFundraiserPath\(\) : signupPath\("creator", "\/dashboard\/act\/new"\)/);
  assert.match(list, /<ButtonLink href=\{startHref\} arrow>Create a fundraiser<\/ButtonLink>/);
});

test("no acquisition surface still says List an act, and every call to action points somewhere that answers", () => {
  const surfaces = [
    "src/app/page.tsx", "src/app/list/page.tsx", "src/app/how-sponsorship-works/page.tsx", "src/app/fundraisers/page.tsx",
    "src/components/Nav.tsx", "src/components/Footer.tsx", "src/lib/site.ts", "src/lib/contact.ts", "src/app/signup/page.tsx", "src/app/login/page.tsx",
  ];
  const routes: Record<string, string> = {
    "/": "src/app/page.tsx", "/list": "src/app/list/page.tsx", "/fundraisers": "src/app/fundraisers/page.tsx", "/contact": "src/app/contact/page.tsx",
    "/widget": "src/app/widget/page.tsx", "/login": "src/app/login/page.tsx", "/signup": "src/app/signup/page.tsx",
    "/how-sponsorship-works": "src/app/how-sponsorship-works/page.tsx", "/how-sponsorship-works/music": "src/app/how-sponsorship-works/music/page.tsx",
  };
  for (const file of surfaces) {
    const source = code(file);
    assert.doesNotMatch(source, /List an act|list your act/i, file);
    for (const m of source.matchAll(/href="(\/[^"#?]*)/g)) {
      if (m[1] in routes) assert.ok(existsSync(path.join(ROOT, routes[m[1]])), `${file}: ${m[1]}`);
    }
  }
});

test("the widget page is music's and says so, and the contact keys are the stored ones", () => {
  assert.match(code("src/app/widget/page.tsx"), /title: "Music fundraiser widget"/);
  assert.deepEqual([...CONTACT_REASON_KEYS], ["list_an_act", "back_a_run", "partnership", "venue", "press", "payment_or_placement", "something_else"]);
});

test("no link inside the site still points at the index's old address", () => {
  // /auctions redirects, so a stale link would still arrive, one hop late and unnoticed. This is
  // what notices. The cron route and the bidding module keep the word: neither is a page.
  const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(dir, e.name)] : []);
  const stale: string[] = [];
  for (const file of walk("src")) {
    code(file).split("\n").forEach((line, i) => {
      if (/["'`/]\/?auctions\b/.test(line) && !/@\/lib\/auctions|api\/cron\/auctions/.test(line) && /\/auctions/.test(line)) stale.push(`${file}:${i + 1} ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(stale, []);
  assert.match(read("src/lib/outbox.ts"), /\$\{SITE\.url\}\/fundraisers/, "the one email that links to the index uses the new address");
  assert.match(read("src/app/sitemap.ts"), /"\/fundraisers"/);
  assert.match(read("src/app/fundraisers/page.tsx"), /alternates: \{ canonical: "\/fundraisers" \}/);
});
