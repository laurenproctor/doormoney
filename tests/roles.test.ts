/*
  One account, either job, or both. The part with no database in it: what the sign-up form is
  allowed to send, and where an account lands once it is in.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { ROLES, RolesInput, hasRole, homeFor, isRole } from "@/lib/roles";

test("there are two roles and they are the two sides of the room", () => {
  assert.deepEqual(ROLES.map((r) => r.key), ["musician", "patron"]);
  assert.deepEqual(ROLES.map((r) => r.label), ["I’m a musician", "I want to support musicians"]);
  assert.equal(isRole("musician"), true);
  assert.equal(isRole("admin"), false);
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

test("a musician lands on the board", () => {
  assert.equal(homeFor({ roles: ["musician"], hasAct: false }), "/dashboard");
  assert.equal(homeFor({ roles: ["musician"], hasAct: true }), "/dashboard");
});

test("a patron lands on what they have backed", () => {
  assert.equal(homeFor({ roles: ["patron"], hasAct: false }), "/patron");
});

test("owning an act beats what was ticked at sign-up", () => {
  assert.equal(homeFor({ roles: ["patron"], hasAct: true }), "/dashboard");
});

test("both roles land on the board, which is the side with money on it", () => {
  assert.equal(homeFor({ roles: ["musician", "patron"], hasAct: false }), "/dashboard");
});

test("an account from before roles existed still lands somewhere", () => {
  assert.equal(homeFor({ roles: [], hasAct: false }), "/dashboard");
  assert.equal(homeFor({ roles: null, hasAct: true }), "/dashboard");
  assert.equal(hasRole(undefined, "patron"), false);
});
