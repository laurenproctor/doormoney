/*
  The musician's dashboard, the part with no database in it.

  Everything the overview claims is derived here, so this is where the claims are checked: that a
  refund comes off the total, that an asking price is not money, that a cancelled fundraiser is not
  a stage, and that nothing offers a musician a button the schema cannot honour.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LIFECYCLE_STEPS,
  plural,
  daysRemaining,
  defaultRun,
  currentNavHref,
  dashboardNav,
  filterWork,
  groupPayouts,
  isShareable,
  lifecycleIndex,
  lifecycleLabel,
  logoState,
  netCents,
  paymentLabel,
  playedCount,
  preparationItems,
  previewTarget,
  raisedCents,
  selectableRuns,
  upcomingShow,
  workAction,
  workCounts,
  type ShowRow,
  type WorkRow,
} from "@/lib/dashboardModel";

/* ------------------------------------------------------------------ lifecycle */

test("the database word becomes the musician's word, and closed reads as finished", () => {
  assert.equal(lifecycleLabel("draft"), "Draft");
  assert.equal(lifecycleLabel("open"), "Open");
  assert.equal(lifecycleLabel("live"), "Live");
  assert.equal(lifecycleLabel("closed"), "Complete");
  assert.equal(lifecycleLabel("cancelled"), "Cancelled");
});

test("an unknown status does not blow up the header", () => {
  assert.equal(lifecycleLabel("something-new"), "Draft");
});

test("cancelled is an ending, not a step on the strip", () => {
  assert.deepEqual([...LIFECYCLE_STEPS], ["draft", "open", "live", "closed"]);
  assert.equal(lifecycleIndex("live"), 2);
  assert.equal(lifecycleIndex("cancelled"), null);
});

test("there is no fulfillment step, because nothing records one", () => {
  assert.ok(!LIFECYCLE_STEPS.includes("fulfillment" as never));
});

/* ------------------------------------------------------------------ money */

const paid = (amount: number, refunded = 0, status = "held") => ({
  amount_cents: amount,
  refunded_cents: refunded,
  payment_status: status,
});

test("a payment that never went through is not money", () => {
  assert.equal(netCents(paid(50_000, 0, "requires_payment")), 0);
});

test("a refund comes off the total", () => {
  assert.equal(netCents(paid(120_000, 40_000, "partially_refunded")), 80_000);
  assert.equal(netCents(paid(120_000, 120_000, "refunded")), 0);
});

test("a refund larger than the payment still cannot make the total negative", () => {
  assert.equal(netCents(paid(10_000, 25_000, "refunded")), 0);
});

test("raised is every settled purchase and backing, less what went back", () => {
  const rows = [
    paid(120_000),
    paid(50_000, 10_000, "partially_refunded"),
    paid(90_000, 90_000, "refunded"),
    paid(75_000, 0, "requires_payment"),
    paid(2_500, 0, "released"),
  ];
  assert.equal(raisedCents(rows), 120_000 + 40_000 + 0 + 0 + 2_500);
});

test("nothing sold raises nothing", () => {
  assert.equal(raisedCents([]), 0);
});

/* ------------------------------------------------------------------ payouts */

test("the schedule groups into paid, scheduled and paused", () => {
  const totals = groupPayouts([
    { amount_cents: 10_000, status: "paid" },
    { amount_cents: 10_000, status: "paid" },
    { amount_cents: 30_000, status: "scheduled" },
    { amount_cents: 5_000, status: "paused" },
  ]);
  assert.deepEqual(totals, { paidCents: 20_000, scheduledCents: 30_000, pausedCents: 5_000 });
});

test("a slice a refund cancelled is counted nowhere, so no total promises it", () => {
  const totals = groupPayouts([{ amount_cents: 99_000, status: "skipped" }]);
  assert.deepEqual(totals, { paidCents: 0, scheduledCents: 0, pausedCents: 0 });
});

/* ------------------------------------------------------------------ dates */

test("days remaining counts calendar days in UTC, and the last day counts", () => {
  const today = new Date(Date.UTC(2026, 8, 5));
  assert.equal(daysRemaining("2026-09-05", today), 0);
  assert.equal(daysRemaining("2026-09-06", today), 1);
  assert.equal(daysRemaining("2026-10-23", today), 48);
});

test("a fundraiser that already ended shows nothing left rather than a negative", () => {
  assert.equal(daysRemaining("2026-09-01", new Date(Date.UTC(2026, 8, 5))), 0);
});

test("a late-evening clock west of UTC does not lose a day", () => {
  // 2026-09-05T23:30-07:00 is already the 6th in UTC; the date column is a calendar day either way.
  assert.equal(daysRemaining("2026-09-10", new Date("2026-09-06T06:30:00Z")), 4);
});

/* ------------------------------------------------------------------ shows */

const show = (id: string, on: string, extra: Partial<ShowRow> = {}): ShowRow => ({
  id,
  played_on: on,
  venue: "Mercury Lounge",
  city: "New York, NY",
  played: false,
  attendance: null,
  photo_url: null,
  ...extra,
});

test("the next show is the earliest one still ahead", () => {
  const today = new Date(Date.UTC(2026, 8, 5));
  const shows = [show("c", "2026-10-01"), show("a", "2026-09-12"), show("b", "2026-09-20")];
  assert.equal(upcomingShow(shows, today)?.id, "a");
});

test("a show earlier today still counts as the next one", () => {
  const today = new Date(Date.UTC(2026, 8, 12));
  assert.equal(upcomingShow([show("a", "2026-09-12")], today)?.id, "a");
});

test("a fundraiser with every date behind it has no next show", () => {
  const today = new Date(Date.UTC(2026, 11, 1));
  assert.equal(upcomingShow([show("a", "2026-09-12"), show("b", "2026-09-20")], today), null);
  assert.equal(upcomingShow([], today), null);
});

test("played is counted, not assumed from the date", () => {
  assert.equal(playedCount([show("a", "2026-09-12", { played: true }), show("b", "2026-09-20")]), 1);
});

/* ------------------------------------------------------------------ sponsorship work */

const work = (id: string, over: Partial<WorkRow> = {}): WorkRow => ({
  id,
  sponsor: "A patron",
  option: "Merch table runner",
  amountCents: 50_000,
  logo: "waiting",
  paymentStatus: "held",
  markNote: null,
  markText: null,
  markUrl: null,
  ...over,
});

test("mark_status becomes the logo state a musician reads", () => {
  assert.equal(logoState("none"), "waiting");
  assert.equal(logoState("submitted"), "review");
  assert.equal(logoState("approved"), "approved");
  assert.equal(logoState("declined"), "declined");
  assert.equal(logoState("anything-else"), "waiting");
});

test("the payment state says what happened to the money", () => {
  assert.equal(paymentLabel("held"), "Paid, held");
  assert.equal(paymentLabel("released"), "Paid out");
  assert.equal(paymentLabel("refunded"), "Refunded");
  assert.equal(paymentLabel("partially_refunded"), "Partly refunded");
  assert.equal(paymentLabel("requires_payment"), "Awaiting payment");
});

test("only a submitted logo is a decision; everything else opens the record", () => {
  assert.deepEqual(workAction(work("1", { logo: "review" })), { kind: "review", label: "Review logo" });
  const approved = workAction(work("abc", { logo: "approved" }));
  assert.deepEqual(approved, { kind: "record", label: "View record", href: "/record/abc" });
});

test("no row ever offers to upload proof, because nothing stores one", () => {
  for (const state of ["waiting", "review", "approved", "declined"] as const) {
    const action = workAction(work("1", { logo: state }));
    assert.ok(!/proof|upload/i.test(action.label), `${state} offered ${action.label}`);
  }
});

test("search looks at the sponsor and the sponsorship option, and ignores case", () => {
  const rows = [
    work("1", { sponsor: "Marlowe Coffee", option: "Merch table runner" }),
    work("2", { sponsor: "Northline Records", option: "Kick drum head" }),
  ];
  assert.deepEqual(filterWork(rows, "marlowe", "all").map((r) => r.id), ["1"]);
  assert.deepEqual(filterWork(rows, "KICK", "all").map((r) => r.id), ["2"]);
  assert.deepEqual(filterWork(rows, "  ", "all").map((r) => r.id), ["1", "2"]);
  assert.deepEqual(filterWork(rows, "nothing here", "all"), []);
});

test("the filter and the search apply together", () => {
  const rows = [
    work("1", { sponsor: "Marlowe Coffee", logo: "review" }),
    work("2", { sponsor: "Marlowe Tea", logo: "approved" }),
  ];
  assert.deepEqual(filterWork(rows, "marlowe", "review").map((r) => r.id), ["1"]);
});

test("the badge numbers are counted off the rows, so they cannot disagree with the table", () => {
  const rows = [work("1", { logo: "review" }), work("2", { logo: "review" }), work("3", { logo: "approved" })];
  assert.deepEqual(workCounts(rows), { all: 3, waiting: 0, review: 2, approved: 1, declined: 0 });
  assert.deepEqual(workCounts([]), { all: 0, waiting: 0, review: 0, approved: 0, declined: 0 });
});

/* ------------------------------------------------------------------ preparation */

test("preparation is counted from rows, and an empty fundraiser asks for nothing", () => {
  assert.deepEqual(
    preparationItems({ work: [], shows: [], runId: "r1", promisedAttendance: true, promisedShowPhotos: true }),
    [],
  );
});

test("a count of one reads as one, not as one of something plural", () => {
  assert.equal(plural(1, "logo", "logos"), "logo");
  assert.equal(plural(0, "logo", "logos"), "logos");
  assert.equal(plural(2, "logo", "logos"), "logos");
  const one = preparationItems({
    work: [work("1", { logo: "review" })],
    shows: [],
    runId: "r1",
    promisedAttendance: false,
    promisedShowPhotos: false,
  });
  assert.equal(one[0].label, "logo waiting for your review");
  const two = preparationItems({
    work: [work("1", { logo: "review" }), work("2", { logo: "review" })],
    shows: [],
    runId: "r1",
    promisedAttendance: false,
    promisedShowPhotos: false,
  });
  assert.equal(two[0].label, "logos waiting for your review");
});

test("logos to review and paid sponsorships with no logo are each their own line", () => {
  const items = preparationItems({
    work: [work("1", { logo: "review" }), work("2", { logo: "waiting", paymentStatus: "held" })],
    shows: [],
    runId: "r1",
    promisedAttendance: false,
    promisedShowPhotos: false,
  });
  assert.deepEqual(items.map((i) => [i.key, i.count]), [["review", 1], ["no-logo", 1]]);
});

test("a sponsorship that was never charged is not chased for a logo", () => {
  const items = preparationItems({
    work: [work("1", { logo: "waiting", paymentStatus: "requires_payment" })],
    shows: [],
    runId: "r1",
    promisedAttendance: false,
    promisedShowPhotos: false,
  });
  assert.deepEqual(items, []);
});

test("attendance and photos are only asked for when the fundraiser promised them", () => {
  const shows = [show("a", "2026-09-12", { played: true })];
  const without = preparationItems({ work: [], shows, runId: "r1", promisedAttendance: false, promisedShowPhotos: false });
  assert.deepEqual(without.map((i) => i.key), []);
  const withBoth = preparationItems({ work: [], shows, runId: "r1", promisedAttendance: true, promisedShowPhotos: true });
  assert.deepEqual(withBoth.map((i) => i.key), ["attendance", "photo"]);
});

test("a show with no venue or city is worth fixing before anyone turns up", () => {
  const shows = [show("a", "2026-09-12", { venue: "  " }), show("b", "2026-09-20", { city: null })];
  const items = preparationItems({ work: [], shows, runId: "r1", promisedAttendance: false, promisedShowPhotos: false });
  assert.deepEqual(items.map((i) => [i.key, i.count, i.href]), [["place", 2, "/dashboard/runs/r1#shows"]]);
});

/* ------------------------------------------------------------------ navigation */

test("an organizer gets six destinations, named for where they go", () => {
  // /dashboard/act left the rail when the profile became one page: the organizer's own record is
  // part of /dashboard/profile now and is reached from there. The widget left it on the Desk
  // register: it is one fundraiser's embed snippet, so it belongs beside that fundraiser under
  // Share rather than in the list of places to go.
  const nav = dashboardNav({ hasAct: true, roles: ["organizer"] });
  assert.deepEqual(nav.flatMap((s) => s.items), [
    { href: "/dashboard", label: "Today" },
    { href: "/dashboard/runs", label: "Fundraisers" },
    { href: "/dashboard/payouts", label: "Money" },
    { href: "/patron", label: "Backed by you" },
    { href: "/dashboard/profile", label: "Profile" },
    { href: "/dashboard/account", label: "Settings" },
  ]);
});

test("an account made before the organizer role still gets them", () => {
  // Expansion Phase 2 writes "organizer"; every account made before it carries "musician", and
  // both mean somebody who raises money here.
  const hrefs = dashboardNav({ hasAct: false, roles: ["musician"] }).flatMap((s) => s.items.map((i) => i.href));
  assert.ok(hrefs.includes("/dashboard/runs"), "a musician lost the fundraising section");
});

test("somebody who only backs musicians gets no fundraising pages", () => {
  const nav = dashboardNav({ hasAct: false, roles: ["patron"] });
  const hrefs = nav.flatMap((s) => s.items.map((i) => i.href));
  assert.deepEqual(hrefs, ["/patron", "/dashboard/profile", "/dashboard/account"]);
  assert.ok(!hrefs.includes("/dashboard/act"));
});

test("owning an act is enough, whatever the roles say", () => {
  const hrefs = dashboardNav({ hasAct: true, roles: [] }).flatMap((s) => s.items.map((i) => i.href));
  assert.ok(hrefs.includes("/dashboard/runs"), "an account that owns an act lost the fundraising section");
});

test("there is one profile, not an organizer's and a patron's", () => {
  // The rail used to carry "Organizer profile" in one section and "Patron profile" in another,
  // which read as two accounts for two people. One account, one identity: /dashboard/profile holds
  // all of it, and the two participation modes are what the sections are named for.
  const nav = dashboardNav({ hasAct: true, roles: ["musician"] });
  const items = nav.flatMap((s) => s.items);
  const profiles = items.filter((i) => /profile/i.test(i.label));
  assert.deepEqual(profiles, [{ href: "/dashboard/profile", label: "Profile" }]);
  assert.ok(!items.some((i) => i.href === "/dashboard/act"), "the organizer record is reached from the profile now");
  assert.deepEqual(nav.map((s) => s.title), ["Creating", "Supporting", "Account"]);
});

test("a child route lights its section, and overview does not light everything", () => {
  const nav = dashboardNav({ hasAct: true, roles: ["musician"] });
  assert.equal(currentNavHref("/dashboard", nav), "/dashboard");
  assert.equal(currentNavHref("/dashboard/runs/abc", nav), "/dashboard/runs");
  // /dashboard/act is still the organizer editor and still has its address; it belongs to Profile.
  assert.equal(currentNavHref("/dashboard/act", nav), "/dashboard/profile");
  assert.equal(currentNavHref("/dashboard/act/new", nav), "/dashboard/profile");
  assert.equal(currentNavHref("/nowhere", nav), null);
});

/* ------------------------------------------------------------------ preview and share */

test("a draft previews privately, because it has no public address yet", () => {
  const target = previewTarget({ id: "r1", slug: "fall-shows", status: "draft" }, "rosie-the-bassoonist");
  assert.deepEqual(target, { kind: "preview", path: "/dashboard/runs/r1/preview", label: "Preview draft" });
  assert.equal(isShareable("draft"), false);
});

test("a published fundraiser points at the address patrons use", () => {
  const target = previewTarget({ id: "r1", slug: "fall-shows", status: "live" }, "rosie-the-bassoonist");
  assert.deepEqual(target, {
    kind: "public",
    path: "/rosie-the-bassoonist/support-fall-shows",
    label: "View fundraiser",
  });
  assert.ok(isShareable("live") && isShareable("open") && isShareable("closed"));
});

/* ------------------------------------------------------------------ selection */

test("the selector offers everything but cancelled, newest first", () => {
  const runs = [
    { id: "a", status: "closed", starts_on: "2026-01-10" },
    { id: "b", status: "cancelled", starts_on: "2026-06-01" },
    { id: "c", status: "live", starts_on: "2026-09-12" },
  ];
  assert.deepEqual(selectableRuns(runs).map((r) => r.id), ["c", "a"]);
});

test("the newest running fundraiser is the one it opens on", () => {
  const runs = [
    { id: "old-live", status: "live", starts_on: "2026-02-01" },
    { id: "newest-draft", status: "draft", starts_on: "2026-11-01" },
  ];
  assert.equal(defaultRun(runs)?.id, "old-live");
});

test("with nothing running it falls back to the newest, and with nothing at all to null", () => {
  assert.equal(defaultRun([{ id: "d", status: "draft", starts_on: "2026-03-01" }])?.id, "d");
  assert.equal(defaultRun([]), null);
  assert.equal(defaultRun([{ id: "x", status: "cancelled", starts_on: "2026-03-01" }]), null);
});
