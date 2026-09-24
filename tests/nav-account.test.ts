import assert from "node:assert/strict";
import { test } from "node:test";
import { navAccountName } from "@/lib/nav-account";

test("the top bar names the account holder, then the handle, then the email", () => {
  assert.equal(navAccountName({ name: "Ada Lovelace", username: "ada", email: "ada@example.com" }), "Ada Lovelace");
  assert.equal(navAccountName({ name: "  ", username: "ada", email: "ada@example.com" }), "ada");
  assert.equal(navAccountName({ name: null, username: null, email: "ada.l@example.com" }), "ada.l");
  assert.equal(navAccountName({}), "Your account");
});
