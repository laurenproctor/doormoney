/*
  Password recovery at /forgot.

  The repository tests logic without a DOM, so the checks below split in two. The first half runs
  the route's own validation module. The second reads the route's source, which is the only way to
  pin copy and attributes here, and is worth doing because most of what went wrong with this page
  was words rather than behavior: it addressed "the act", promised that a link "sets a new
  password", and leaked "board" and "runs" into a page every kind of account holder reaches.

  The rendering, focus and responsive behavior were checked in a browser and are reported with the
  change rather than asserted here.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EMPTY_MESSAGE, ERROR_ID, FIELD_ID, HINT_ID, describedBy, isBlankHandle } from "@/app/forgot/validate";

const dir = path.join(import.meta.dirname, "..", "src", "app", "forgot");
const page = readFileSync(path.join(dir, "page.tsx"), "utf8");
const form = readFileSync(path.join(dir, "ForgotPasswordForm.tsx"), "utf8");
const both = page + form;

/* ---------------------------------------------------------------------------------------------
   What the page refuses to send
   --------------------------------------------------------------------------------------------- */

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

/* ---------------------------------------------------------------------------------------------
   What the field tells assistive technology
   --------------------------------------------------------------------------------------------- */

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

test("the field keeps the name and the attributes the reset action and the browser expect", () => {
  assert.match(form, /name="handle"/, "the action reads handle; renaming it would break the reset");
  for (const attr of ['autoComplete="username"', 'autoCapitalize="none"', "spellCheck={false}", "required"]) {
    assert.ok(form.includes(attr), `the field lost ${attr}`);
  }
  assert.match(form, /htmlFor=\{FIELD_ID\}/, "the label is no longer tied to the field");
  assert.match(form, /aria-invalid=/, "the field never reports itself invalid");
  assert.match(form, /aria-busy=\{pending\}/, "nothing tells assistive technology the form is working");
});

test("the page calls the shared action rather than reimplementing the reset", () => {
  assert.match(form, /requestPasswordReset/);
  // The shared component in src/components/PasswordForms.tsx still serves /reset and the account page.
  assert.ok(!page.includes("PasswordForms"), "the route should use its own form now");
});

/* ---------------------------------------------------------------------------------------------
   The words on the page
   --------------------------------------------------------------------------------------------- */

test("the default state says what it was asked to say", () => {
  for (const copy of [
    "Account recovery",
    "Reset your",
    "Enter the email address or username you use for Door Money.",
    "Email address or username",
    "The link can be used once and expires after one hour.",
    "Send reset link",
    "Remember your password?",
    "Contact us",
  ]) {
    assert.ok(both.includes(copy), `missing: ${copy}`);
  }
});

test("the confirmation is true whether or not an account matched", () => {
  assert.ok(form.includes("Email sent"));
  assert.ok(form.includes("Check your inbox"));
  assert.ok(form.includes("If an account matches those details"));
  assert.ok(form.includes("Back to sign in"));
  assert.ok(form.includes("Try another email or username"));
  // The one thing this page must never do.
  for (const leak of ["not found", "no account", "does not exist", "is registered", "already an account"]) {
    assert.ok(!both.toLowerCase().includes(leak), `the page can distinguish accounts: ${leak}`);
  }
});

test("the button says it is working, and stops saying send", () => {
  assert.ok(form.includes("Sending…"));
});

test("the retired words are gone from this route", () => {
  for (const gone of ["For acts already listed", "Musicians. Patrons. Together.", "How it goes", "It sets a new password"]) {
    assert.ok(!both.includes(gone), `still on the page: ${gone}`);
  }
  // Word boundaries, or "the act" matches inside "the action" and "board" inside "onboard".
  for (const gone of [/\bthe acts?\b/i, /\bboards?\b/i, /\bruns\b/i]) {
    assert.ok(!gone.test(both), `still on the page: ${gone}`);
  }
});

test("the route carries its own header and footer, not the marketing ones", () => {
  assert.ok(!page.includes("@/components/Nav"), "the marketing nav is back");
  assert.ok(!page.includes("@/components/Footer"), "the marketing footer is back");
  assert.ok(!page.includes("Newsletter"), "the newsletter is back on a recovery page");
  assert.ok(!page.includes("List an act"), "the marketing call to action is back");
  assert.match(page, /href="\/login"/);
  for (const href of ["/privacy", "/terms", "/accessibility", "/contact"]) {
    assert.ok(page.includes(`"${href}"`), `the footer lost ${href}`);
  }
});

test("the route's own metadata, and the noindex the other account pages use", () => {
  assert.ok(page.includes('title: { absolute: "Reset your password | Door Money" }'));
  assert.ok(page.includes("Request a secure link to reset your Door Money password."));
  assert.match(page, /robots: \{ index: false \}/);
});

test("one h1, and the skip link still lands on the form", () => {
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
  assert.ok(!form.includes("<h1"), "the form must not add a second h1");
  assert.match(page, /href="#form"/);
  assert.match(page, /id="form"/);
  assert.match(page, /<main id="main"/);
});
