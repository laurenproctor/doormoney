/*
  The bar across the dashboard. Both jobs have to be reachable from one account without
  changing a setting.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { dashboardLinks } from "@/lib/roles";


const hrefs = (args: { hasAct: boolean; roles: string[] }) => dashboardLinks(args).map((l) => l.href);

test("a musician gets the board pages and the backed page", () => {
  assert.deepEqual(hrefs({ hasAct: true, roles: ["musician"] }), ["/dashboard", "/dashboard/act", "/dashboard/payouts", "/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("a patron reaches the public profile without owning an act", () => {
  assert.ok(hrefs({ hasAct: false, roles: ["patron"] }).includes("/dashboard/profile"));
});

test("a patron gets no board pages", () => {
  assert.deepEqual(hrefs({ hasAct: false, roles: ["patron"] }), ["/patron", "/dashboard/profile", "/dashboard/account"]);
});

test("somebody who is both gets everything, and gets it once", () => {
  const links = hrefs({ hasAct: true, roles: ["musician", "patron"] });
  assert.deepEqual(links, ["/dashboard", "/dashboard/act", "/dashboard/payouts", "/patron", "/dashboard/profile", "/dashboard/account"]);
  assert.equal(new Set(links).size, links.length);
});

test("owning an act is enough, whatever the roles say", () => {
  assert.ok(hrefs({ hasAct: true, roles: [] }).includes("/dashboard/act"));
});

test("an account with nothing yet still has somewhere to go", () => {
  assert.deepEqual(hrefs({ hasAct: false, roles: [] }), ["/patron", "/dashboard/profile", "/dashboard/account"]);
});
