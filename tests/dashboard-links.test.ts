/*
  The bar across the dashboard. Both jobs have to be reachable from one account without
  changing a setting.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardLinks } from "@/lib/roles";
import { NAV } from "@/lib/site";


const hrefs = (args: { hasAct: boolean; roles: string[] }) => dashboardLinks(args).map((l) => l.href);

test("a musician gets the board pages and the backed page", () => {
  assert.deepEqual(hrefs({ hasAct: true, roles: ["musician"] }), ["/dashboard", "/dashboard/act", "/dashboard/payouts", "/widget", "/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("a patron reaches the public profile without owning an act", () => {
  assert.ok(hrefs({ hasAct: false, roles: ["patron"] }).includes("/dashboard/profile"));
});

test("a patron gets no board pages", () => {
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
  assert.equal(nav.find((n) => n.href === "/auctions")?.label, "Fundraisers");
  assert.ok(!nav.some((n) => /board/i.test(n.label)), "a nav label still says board");
});
