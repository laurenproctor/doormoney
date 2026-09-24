import assert from "node:assert/strict";
import { test } from "node:test";
import { sponsorFields } from "@/lib/sponsor-identity";

test("a signed-in visitor sponsors under the account's email and never types one", () => {
  const fields = sponsorFields({ name: "Ada Lovelace", email: "Ada@Example.com " });
  assert.equal(fields.email, "ada@example.com");
  assert.equal(fields.emailIsAccount, true);
  assert.equal(fields.name, "Ada Lovelace");
});

test("an account with no name still fills the email and leaves the name to type", () => {
  const fields = sponsorFields({ name: null, email: "ada@example.com" });
  assert.equal(fields.name, "");
  assert.equal(fields.emailIsAccount, true);
});

test("a visitor with no account types both", () => {
  assert.deepEqual(sponsorFields(null), { name: "", email: "", emailIsAccount: false });
  assert.deepEqual(sponsorFields({ name: "Ada", email: "  " }), { name: "", email: "", emailIsAccount: false });
});
