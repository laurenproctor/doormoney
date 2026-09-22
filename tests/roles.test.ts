/*
  One account, either job, or both. The part with no database in it: what a roles array is allowed
  to hold, where an account lands once it is in, and the bar across the dashboard that has to reach
  both jobs from one account without changing a setting.

  The sign-up form no longer sends roles at all: every account is opened with both capabilities
  (DEFAULT_ROLES here, migration 0051 in the database), so RolesInput below is the guard on what
  may reach the column rather than on what a form may post.

  tests/dashboard-links.test.ts was merged in here in the testing-suite audit: it tested the same
  module from a second file.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ROLES, ROLES, RolesInput, dashboardLinks, hasRole, homeFor, isRole } from "@/lib/roles";
import { NAV } from "@/lib/site";

test("there are two capabilities and they are named as the actions they are", () => {
  // The labels used to be the sign-up question ("I want to raise funds"). Nobody is asked now, so
  // they are what the dashboard offers instead: one account, two things it can do.
  assert.deepEqual(ROLES.map((r) => r.key), ["organizer", "patron"]);
  assert.deepEqual(ROLES.map((r) => r.label), ["Create a fundraiser", "Support a fundraiser"]);
  assert.equal(isRole("musician"), true);
  assert.equal(isRole("admin"), false);
});

test("every new account is opened with both, and never with none", () => {
  assert.deepEqual([...DEFAULT_ROLES], ["organizer", "patron"]);
  assert.ok(DEFAULT_ROLES.length > 0, "an account with no capabilities is not a state the product has");
});

test("either role on its own is fine", () => {
  assert.deepEqual(RolesInput.parse(["musician"]), ["musician"]);
  assert.deepEqual(RolesInput.parse(["patron"]), ["patron"]);
});

test("both at once is the point, and comes back in a stable order", () => {
  assert.deepEqual(RolesInput.parse(["patron", "musician"]), ["musician", "patron"]);
});

test("nothing chosen is refused, because the answer decides where they land", () => {
  const r = RolesInput.safeParse([]);
  assert.equal(r.success, false);
  assert.match(r.error?.issues[0]?.message ?? "", /at least one/);
});

test("a role the app does not know is dropped, and dropping them all is still refused", () => {
  assert.deepEqual(RolesInput.parse(["musician", "admin"]), ["musician"]);
  assert.equal(RolesInput.safeParse(["admin"]).success, false);
});

test("a musician lands on the dashboard", () => {
  assert.equal(homeFor({ roles: ["musician"], hasAct: false }), "/dashboard");
  assert.equal(homeFor({ roles: ["musician"], hasAct: true }), "/dashboard");
});

test("everybody lands on the same dashboard, whatever they came here to do", () => {
  // It used to send a patron to /patron and everyone else to /dashboard, which decided what
  // somebody was before they had done anything. The dashboard offers both sides instead.
  assert.equal(homeFor({ roles: ["patron"], hasAct: false }), "/dashboard");
  assert.equal(homeFor({ roles: ["organizer"], hasAct: false }), "/dashboard");
  assert.equal(homeFor(), "/dashboard");
});

test("owning an act beats what was ticked at sign-up", () => {
  assert.equal(homeFor({ roles: ["patron"], hasAct: true }), "/dashboard");
});

test("both roles land on the dashboard, which is the side with money on it", () => {
  assert.equal(homeFor({ roles: ["musician", "patron"], hasAct: false }), "/dashboard");
});

test("an account from before roles existed still lands somewhere", () => {
  assert.equal(homeFor({ roles: [], hasAct: false }), "/dashboard");
  assert.equal(homeFor({ roles: null, hasAct: true }), "/dashboard");
  assert.equal(hasRole(undefined, "patron"), false);
});

/* ---------------------------------------------------------------------------------------------
   The bar across the dashboard
   --------------------------------------------------------------------------------------------- */

const hrefs = (args: { hasAct: boolean; roles: string[] }) => dashboardLinks(args).map((l) => l.href);

test("a musician gets the dashboard pages and the backed page", () => {
  assert.deepEqual(hrefs({ hasAct: true, roles: ["musician"] }), ["/dashboard", "/dashboard/act", "/dashboard/payouts", "/widget", "/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("a patron reaches the public profile without owning an act", () => {
  assert.ok(hrefs({ hasAct: false, roles: ["patron"] }).includes("/dashboard/profile"));
});

test("a patron gets no dashboard-only pages", () => {
  assert.deepEqual(hrefs({ hasAct: false, roles: ["patron"] }), ["/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("somebody who is both gets everything, and gets it once", () => {
  const links = hrefs({ hasAct: true, roles: ["musician", "patron"] });
  assert.deepEqual(links, ["/dashboard", "/dashboard/act", "/dashboard/payouts", "/widget", "/patron", "/dashboard/profile", "/dashboard/account"]);
  assert.equal(new Set(links).size, links.length);
});

test("owning an act is enough, whatever the roles say", () => {
  assert.ok(hrefs({ hasAct: true, roles: [] }).includes("/dashboard/act"));
});

test("the widget is reachable from the dashboard, and only by a musician", () => {
  // It left the site nav in decision 14, so this is now the only way to the page.
  assert.ok(hrefs({ hasAct: true, roles: ["musician"] }).includes("/widget"));
  assert.ok(!hrefs({ hasAct: false, roles: ["patron"] }).includes("/widget"));
});

test("an account with nothing yet still has somewhere to go", () => {
  assert.deepEqual(hrefs({ hasAct: false, roles: [] }), ["/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("the site nav no longer carries the widget, and names the browse page fundraisers", () => {
  // Decision 14: the widget moved to the dashboard, and "Live boards" became "Fundraisers".
  // NAV is `as const`, so the href comparison only type-checks once it is widened. Putting the
  // widget back would widen the union again and this assertion would then fail, which is the point.
  const nav: readonly { href: string; label: string }[] = NAV;
  assert.ok(!nav.some((n) => n.href === "/widget"), "the widget is back in the site nav");
  assert.equal(nav.find((n) => n.href === "/fundraisers")?.label, "Fundraisers");
  assert.ok(!nav.some((n) => /board/i.test(n.label)), "a nav label still says board");
});


test("organizers can also be patrons without claiming to be musicians", () => {
  assert.deepEqual(RolesInput.parse(["patron", "organizer"]), ["organizer", "patron"]);
  assert.equal(homeFor({ roles: ["organizer", "patron"], hasAct: false }), "/dashboard");
  assert.ok(dashboardLinks({ roles: ["organizer"], hasAct: false }).some((link) => link.href === "/dashboard/act"));
});
