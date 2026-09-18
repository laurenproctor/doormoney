/*
  Password recovery at /forgot.

  What is left here is the route's own validation module: what the page refuses to send, and the
  ids the message and the hint hang on.

  This file used to also read page.tsx and ForgotPasswordForm.tsx as text and assert that
  particular copy and particular JSX attributes appeared in them. Those went in the testing-suite
  audit: they failed on any rewording and passed on a page that did not render, and the words
  themselves are already swept by tests/vocabulary.test.ts, which reads all of src/app. The
  rendering, focus and responsive behavior were checked in a browser and are reported with the
  change rather than asserted here.

  One thing that went with them is worth naming: the page must never tell a stranger whether an
  address has an account behind it. That was asserted by grepping the two files for five phrases,
  which is not much of a guard. The real place for it is a test of requestPasswordReset itself.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_MESSAGE, ERROR_ID, FIELD_ID, HINT_ID, describedBy, isBlankHandle } from "@/app/forgot/validate";

test("nothing typed is nothing to send, whitespace included", () => {
  for (const blank of ["", " ", "   ", "\t", "\n  "]) assert.equal(isBlankHandle(blank), true, JSON.stringify(blank));
});

test("anything else is the server's business, not the page's", () => {
  // A username has no @ in it, so the page must not insist on an address.
  for (const value of ["rosie@example.com", "rosie", "  rosie  ", "rosie-the-bassoonist"]) {
    assert.equal(isBlankHandle(value), false, value);
  }
});

test("the empty message is the one the brief asked for", () => {
  assert.equal(EMPTY_MESSAGE, "Enter your email address or username.");
});

test("the field points at its hint, and at the message as well while there is one", () => {
  assert.equal(describedBy(false), HINT_ID);
  assert.equal(describedBy(true), `${ERROR_ID} ${HINT_ID}`);
  // The message comes first so it is read before the standing hint.
  assert.ok(describedBy(true).startsWith(ERROR_ID));
});

test("the ids are fixed, so aria-describedby does not move between renders", () => {
  assert.equal(FIELD_ID, "forgot-handle");
  assert.equal(new Set([FIELD_ID, HINT_ID, ERROR_ID]).size, 3);
});
