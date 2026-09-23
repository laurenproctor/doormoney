/*
  The Desk register's primitives, rendered for every starting category.

  The same three things `tests/domain-components.test.ts` holds, for the other half of the
  interface. Every primitive renders, to real markup, for music, sports, film and theater. None of
  them says anything about music to somebody who is not music, and none can reach the database,
  start a payment or call the server: the boundary is read from their source rather than taken on
  trust, which is what lets a page swap one of these out without anybody auditing the page.

  Two more, because this register is where the design rules bite hardest: nothing sets text under
  14px, and no component carries a color of its own. Both are properties over the folder, so a
  ninth primitive cannot slip past them by being new.

  Markup is asserted for meaning. Class names are the thing a redesign is supposed to change.
*/
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import * as Desk from "@/components/desk";
import { DOMAIN_FIXTURES, type DomainFixture } from "@/lib/fixtures/domain-fixtures";
import type { ShowRow } from "@/lib/dashboardModel";
import { formatMoney } from "@/lib/money";

const ROOT = path.join(import.meta.dirname, "..");
const DIR = path.join(ROOT, "src/components/desk");
const html = (el: ReactElement) => renderToStaticMarkup(el);
/** What a reader sees: tags out, entities back, whitespace settled. */
const text = (el: ReactElement) =>
  html(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&middot;|·/g, "·").replace(/\s+/g, " ").trim();

const EXPECTED = ["Badge", "Card", "Kpi", "KpiUnit", "MoneyBar", "RowMenuButton", "RunStrip", "Table", "Tabs", "TaskDate", "TaskRow"];

/** Music's dates, invented here rather than in the fixtures: only one category has any. */
const SHOWS: ShowRow[] = [
  { id: "s1", played_on: "2026-10-03", venue: "Union Pool", city: "Brooklyn", played: true, attendance: 120, photo_url: null },
  { id: "s2", played_on: "2026-10-11", venue: "The Bell House", city: "Brooklyn", played: false, attendance: null, photo_url: null },
  { id: "s3", played_on: "2026-10-14", venue: null, city: null, played: false, attendance: null, photo_url: null },
  { id: "s4", played_on: "2026-11-02", venue: "Sleeping Village", city: "Chicago", played: false, attendance: null, photo_url: null },
];
const DURING = new Date("2026-10-05T00:00:00Z");

/**
 * A badge, built through its props object.
 *
 * A badge's word is a required child, and `createElement` in a .ts file has to satisfy the
 * component's own props type, so the word cannot be the third argument the way it would be in
 * JSX. One helper rather than nine, and the rule is switched off for exactly this line.
 */
// eslint-disable-next-line react/no-children-prop
const badge = (kind: Desk.BadgeKind, word: string) => createElement(Desk.Badge, { kind, children: word });

/** Every primitive, for one fixture. The whole of what a workspace page in this category draws. */
function everything(f: DomainFixture): ReactElement[] {
  const first = f.opportunities[0];
  const paid = first.priceCents;
  const bids = f.opportunities[1]?.topBidCents ?? 0;
  return [
    createElement(
      Desk.Card,
      { title: f.fundraiser.title, subtitle: f.fundraiser.purpose, right: badge("attention", "2") },
      createElement("p", null, f.fundraiser.sponsorPromise),
    ),
    createElement(Desk.Kpi, {
      label: "Raised toward goal",
      value: formatMoney(paid + bids),
      extra: createElement(Desk.MoneyBar, { paidCents: paid, bidsCents: bids, goalCents: 600000 }),
      sub: `${formatMoney(paid)} paid`,
    }),
    createElement(Desk.Kpi, {
      label: "Sponsorships",
      value: createElement("span", null, "2 ", createElement(Desk.KpiUnit, null, "sold")),
      sub: f.fundraiser.audience,
    }),
    badge("ok", "Open"),
    badge("attention", "Needs review"),
    badge("neutral", "Draft"),
    createElement(Desk.MoneyBar, { paidCents: paid, bidsCents: bids }),
    createElement(Desk.Tabs, {
      label: "Fundraiser sections",
      current: "overview",
      tabs: [
        { key: "overview", href: "?tab=overview", label: "Overview" },
        { key: "options", href: "?tab=options", label: "Options", count: f.opportunities.length },
        { key: "delivery", href: "?tab=delivery", label: "Delivery", count: 2, tone: "attention" as const },
      ],
    }),
    createElement(Desk.Table, {
      columns: [
        { key: "option", label: "Option", width: "2fr" },
        { key: "sale", label: "Sale" },
        { key: "current", label: "Current" },
        { key: "status", label: "Status" },
      ],
      rows: f.opportunities.map((o) => ({
        key: o.id,
        href: `/dashboard/runs/${f.fundraiser.slug}?tab=options`,
        label: o.name,
        cells: [
          o.name,
          o.saleMethod === "auction" ? "Bidding" : "Fixed price",
          formatMoney(o.topBidCents ?? o.priceCents),
          badge(o.status === "sold" ? "ok" : "neutral", o.status === "sold" ? "Sold" : "Open"),
        ],
        menu: createElement(Desk.RowMenuButton, null),
      })),
    }),
    ...f.commitments.map((c, i) =>
      createElement(Desk.TaskRow, {
        key: c.key,
        lead: createElement(Desk.TaskDate, { day: String(14 + i), month: "Oct" }),
        title: c.label,
        detail: c.detail ?? f.fundraiser.sponsorPromise,
        actions: createElement("button", { type: "button" }, "Open"),
      }),
    ),
    createElement(Desk.TaskRow, { title: `Approve what ${f.sponsor.displayName} sent`, detail: formatMoney(paid) }),
  ];
}

test("the eleven primitives all exist, and nothing else is exported beside them", () => {
  assert.deepEqual(Object.keys(Desk).sort(), EXPECTED.sort());
});

for (const [key, fixture] of Object.entries(DOMAIN_FIXTURES)) {
  test(`every primitive renders for ${key}`, () => {
    const page = everything(fixture).map(text).join("\n");
    for (const must of [
      fixture.fundraiser.title,
      fixture.fundraiser.purpose!,
      fixture.fundraiser.sponsorPromise!,
      fixture.opportunities[0].name,
      fixture.sponsor.displayName,
      "Open",
      "Needs review",
      "Draft",
    ]) {
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

test("a badge says its state in a word, and the dot is only ever decoration", () => {
  const ok = html(badge("ok", "Open"));
  assert.match(text(badge("ok", "Open")), /^Open$/, "the word is the whole accessible name");
  assert.match(ok, /aria-hidden="true"/, "and the dot is hidden from it");
  assert.match(ok, /data-badge="ok"/);
  // Each kind reads its own tokens, and none of them reads the other's.
  assert.match(ok, /bg-ok-wash text-ok-ink/);
  assert.match(html(badge("attention", "3")), /bg-attention-wash text-attention-ink/);
  assert.match(html(badge("neutral", "Draft")), /bg-neutral-wash text-muted/);
});

test("the money bar states every number it draws, and never runs off its own end", () => {
  const withGoal = html(createElement(Desk.MoneyBar, { paidCents: 155000, bidsCents: 250500, goalCents: 600000 }));
  assert.match(withGoal, /aria-label="Goal \$6,000: \$1,550 paid, \$2,505 in bids, \$1,945 open"/);
  assert.match(withGoal, /role="img"/);
  // With no goal there is no open segment, and no goal is claimed.
  const noGoal = html(createElement(Desk.MoneyBar, { paidCents: 155000, bidsCents: 250500 }));
  assert.match(noGoal, /aria-label="\$1,550 paid, \$2,505 in bids"/);
  assert.doesNotMatch(noGoal, /open|Goal/);
  // Past the goal, the widths still add up to the bar rather than to more than it.
  const over = html(createElement(Desk.MoneyBar, { paidCents: 700000, bidsCents: 100000, goalCents: 600000 }));
  const widths = [...over.matchAll(/width:([0-9.]+)%/g)].map((m) => Number(m[1]));
  assert.equal(widths.length, 2);
  assert.ok(widths[0] + widths[1] <= 100.1, `${widths} runs past the end of the bar`);
  assert.match(over, /\$0 open/, "and nothing is open once the goal is passed");
});

test("a tab is an address, and only a count that is waiting on somebody is colored", () => {
  const out = html(
    createElement(Desk.Tabs, {
      label: "Fundraiser sections",
      current: "options",
      tabs: [
        { key: "overview", href: "?tab=overview", label: "Overview" },
        { key: "options", href: "?tab=options", label: "Options", count: 9 },
        { key: "delivery", href: "?tab=delivery", label: "Delivery", count: 2, tone: "attention" as const },
      ],
    }),
  );
  assert.match(out, /href="\?tab=overview"/, "every tab is a URL, so the page stays a server component");
  assert.match(out, /aria-selected="true"[^>]*>Options|Options/);
  assert.equal((out.match(/aria-selected="true"/g) ?? []).length, 1);
  assert.match(out, /border-accent-line/, "the current tab is drawn with the token that holds in both rooms");
  assert.match(out, /bg-attention-wash text-attention-ink[^>]*>2/);
  assert.match(out, /bg-neutral-wash text-muted[^>]*>9/);
  assert.doesNotMatch(html(createElement(Desk.Tabs, { label: "x", current: "a", tabs: [{ key: "a", href: "?tab=a", label: "Overview" }] })), /rounded-full/, "a tab with no count draws no pill");
});

test("a table row can be a link without swallowing its own controls", () => {
  const out = html(
    createElement(Desk.Table, {
      columns: [{ key: "name", label: "Name" }, { key: "status", label: "Status" }],
      rows: [{ key: "r1", href: "/dashboard/runs/1", label: "Fall fundraiser", cells: ["Fall fundraiser", "Open"], menu: createElement(Desk.RowMenuButton, null) }],
    }),
  );
  assert.match(out, /<a[^>]+href="\/dashboard\/runs\/1"/);
  assert.match(out, /aria-label="More"/, "the kebab names itself");
  // The control is a sibling of the link, never inside it: an anchor holding a button is not a control.
  assert.ok(out.indexOf("</a>") < out.indexOf("<button"), "the row link closes before the kebab opens");
  assert.equal((out.match(/Name|Status/g) ?? []).length, 2, "the header says each column once");
});

test("the strip is music's dates and nothing else, and never invents one", () => {
  assert.equal(html(createElement(Desk.RunStrip, { shows: [], today: DURING })), "", "no rows, no strip");
  const out = html(createElement(Desk.RunStrip, { shows: SHOWS, today: DURING }));
  // One circle per row, in date order, with the day under it.
  assert.equal((out.match(/<li/g) ?? []).length, SHOWS.length);
  assert.ok(out.indexOf(">3<") < out.indexOf(">11<") && out.indexOf(">11<") < out.indexOf(">14<"));
  // A date missing a venue is the one thing that asks for attention, and it links to where it is fixed.
  assert.match(out, /aria-label="Oct 14, 2026, missing a venue"/);
  assert.match(out, /<a [^>]*href="#shows"/, "and it goes where the date is fixed");
  assert.match(out, /border-attention-ink/);
  assert.equal((out.match(/border-attention-ink/g) ?? []).length, 1, "and only that one date does");
  // The next date is filled with the page's own light; a played one carries a check.
  assert.match(out, /bg-ok shadow-\[0_0_0_4px_var\(--ok-wash\)\]/);
  assert.match(out, /bg-ok text-on-accent/);
  assert.match(out, /October/);
  assert.match(out, /November/);
  const oneMonth = html(createElement(Desk.RunStrip, { shows: SHOWS.slice(0, 3), today: DURING }));
  assert.equal((oneMonth.match(/October|November/g) ?? []).length, 1, "one month is labelled once, not twice");
});

test("a date that has a venue but no city says which one is missing", () => {
  const out = html(
    createElement(Desk.RunStrip, {
      shows: [{ id: "a", played_on: "2026-10-14", venue: "Union Pool", city: null, played: false, attendance: null, photo_url: null }],
      today: DURING,
    }),
  );
  assert.match(out, /missing a city/);
});

// ---------------------------------------------------------------
// The boundary, and the two design rules that bite hardest here
// ---------------------------------------------------------------

const files = readdirSync(DIR).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
const source = (file: string) => readFileSync(path.join(DIR, file), "utf8");
/** Everything but the comments: a rule about what a component draws is not a rule about its prose. */
const code = (file: string) => source(file).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

test("no desk primitive can reach the database, start a payment, or call the server", () => {
  assert.ok(files.length >= 8);
  for (const file of files) {
    for (const spec of [...source(file).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1])) {
      assert.doesNotMatch(spec, /supabase|stripe|@\/app\/|\/actions\/|@\/lib\/(auth|boards|purchases|backings|refunds|release|auctions|email|outbox|weekly|patronprofile|catalog|sample)\b/, `${file} imports ${spec}`);
    }
    assert.doesNotMatch(code(file), /"use server"|\bfetch\(|process\.env|payment_intent|client_secret|fee_cents|feePercent|\.from\("/, `${file} holds no payment or database logic`);
  }
});

/*
  RunStrip is music's, the way ShowsPanel and RunForm are, and says so at the top of its own file:
  eighteen evenings in a row is a picture of a tour and of nothing else. It is the one primitive
  allowed music's words, and it is named here rather than detected, so adding a second one is a
  decision somebody makes in this file rather than a regular expression quietly widening.
*/
const MUSIC_ONLY = new Set(["RunStrip.tsx"]);

test("no shared desk primitive writes a category's noun by hand", () => {
  // The same rule the domain components hold: words come from src/lib/category-words.ts, and a
  // literal here is how "the musician" reached a theater page.
  for (const file of files.filter((f) => !MUSIC_ONLY.has(f))) {
    assert.doesNotMatch(code(file), /musician|filmmaker|theater company|\bband\b|\btour\b|\blogos?\b|\bshows?\b|New York/i, file);
  }
});

test("nothing on this register sets text under 14px", () => {
  const small: string[] = [];
  for (const file of files) {
    for (const found of code(file).matchAll(/text-\[([0-9.]+)px\]/g)) {
      if (Number(found[1]) < 14) small.push(`${file}: ${found[0]}`);
    }
  }
  assert.deepEqual(small, []);
});

test("no desk primitive carries a color of its own", () => {
  // Every color comes from a token, so a theme change reaches all of them and the contrast test
  // can measure what is actually drawn. A hex here would be outside both.
  for (const file of files) {
    assert.doesNotMatch(code(file), /#[0-9a-f]{3,8}\b|\brgba?\(/i, `${file} picks a color instead of reading one`);
    assert.doesNotMatch(code(file), /border-accent(?!-line)|outline-accent(?!-line)/, `${file}: an edge somebody operates takes accent-line, not the raw accent`);
  }
});
