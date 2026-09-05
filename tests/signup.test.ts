/*
  What the sign-up form refuses before it posts, and the ids the messages hang on.

  The server is the authority: SignUpInput in src/app/actions/auth.ts parses the same fields again
  and nothing reaches Supabase without passing it. src/lib/signup.ts is the copy the page runs so
  it can answer at once, and these tests pin the two together. A rule that changes on the server
  and not here shows up as a field the page waves through; the reverse is a field nobody can
  submit at all, which is the worse of the two, so the client copy is deliberately the looser one.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  NAME_MAX,
  PASSWORD_MAX,
  PASSWORD_MIN,
  SIGNUP_FIELDS,
  errorId,
  firstInvalid,
  validateField,
  validateSignUp,
  type SignUpValues,
} from "@/lib/signup";
import { ROLES } from "@/lib/roles";

const good: SignUpValues = {
  roles: ["musician"],
  first_name: "Rosie",
  last_name: "Bell",
  email: "rosie@example.com",
  password: "a-long-enough-one",
};

const with_ = (patch: Partial<SignUpValues>): SignUpValues => ({ ...good, ...patch });

test("a filled form raises nothing", () => {
  assert.deepEqual(validateSignUp(good), {});
  assert.equal(firstInvalid({}), null);
});

test("an empty form names every field, in reading order", () => {
  const errors = validateSignUp({ roles: [], first_name: "", last_name: "", email: "", password: "" });
  assert.deepEqual(Object.keys(errors).sort(), [...SIGNUP_FIELDS].sort());
  assert.equal(firstInvalid(errors), "roles");
});

test("either role on its own satisfies the question, and so does both", () => {
  for (const roles of [["musician"], ["patron"], ["musician", "patron"]]) {
    assert.equal(validateField("roles", with_({ roles })), undefined, roles.join("+"));
  }
});

test("nothing chosen is refused, and a word that is not a role does not count as one", () => {
  assert.equal(validateField("roles", with_({ roles: [] })), "Pick at least one, or both.");
  assert.equal(validateField("roles", with_({ roles: ["admin"] })), "Pick at least one, or both.");
});

test("the role error goes the moment a role is picked", () => {
  const before = validateSignUp(with_({ roles: [] }));
  assert.equal(before.roles, "Pick at least one, or both.");
  const after = validateSignUp(with_({ roles: ["patron"] }));
  assert.equal(after.roles, undefined);
});

test("a name has to be there, and whitespace is not being there", () => {
  assert.equal(validateField("first_name", with_({ first_name: "" })), "Enter a first name.");
  assert.equal(validateField("first_name", with_({ first_name: "   " })), "Enter a first name.");
  assert.equal(validateField("last_name", with_({ last_name: "  " })), "Enter a last name.");
  assert.equal(validateField("first_name", with_({ first_name: "  Rosie  " })), undefined);
});

test("a name has a ceiling, and it is the server's", () => {
  assert.equal(validateField("first_name", with_({ first_name: "x".repeat(NAME_MAX) })), undefined);
  assert.equal(
    validateField("first_name", with_({ first_name: "x".repeat(NAME_MAX + 1) })),
    `Keep the first name under ${NAME_MAX} characters.`,
  );
});

test("an address without an at sign or a dot is refused", () => {
  for (const email of ["", "rosie", "rosie@example", "rosie example.com", "@example.com"]) {
    assert.equal(validateField("email", with_({ email })), "Enter a valid email address.", email || "(empty)");
  }
  assert.equal(validateField("email", with_({ email: "  rosie@example.com  " })), undefined);
});

test("a password is measured before it is trimmed, because spaces count in one", () => {
  assert.equal(validateField("password", with_({ password: "x".repeat(PASSWORD_MIN - 1) })), `Use at least ${PASSWORD_MIN} characters.`);
  assert.equal(validateField("password", with_({ password: " ".repeat(PASSWORD_MIN) })), undefined);
  assert.equal(
    validateField("password", with_({ password: "x".repeat(PASSWORD_MAX + 1) })),
    `Keep the password under ${PASSWORD_MAX} characters.`,
  );
});

test("focus goes to the first thing wrong, not the last", () => {
  assert.equal(firstInvalid(validateSignUp(with_({ email: "", password: "" }))), "email");
  assert.equal(firstInvalid(validateSignUp(with_({ last_name: "", email: "" }))), "last_name");
  assert.equal(firstInvalid(validateSignUp(with_({ roles: [], password: "" }))), "roles");
});

test("every message has an id of its own, and the form-level one has its own too", () => {
  const ids = [...SIGNUP_FIELDS, "form" as const].map(errorId);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^signup-[a-z-]+-error$/);
  // Underscores would be legal in an id and unreadable in a selector.
  assert.equal(errorId("first_name"), "signup-first-name-error");
});

/* ---------------------------------------------------------------------------------------------
   The two copies of the rules, held together.
   --------------------------------------------------------------------------------------------- */

const server = readFileSync(path.join(import.meta.dirname, "..", "src", "app", "actions", "auth.ts"), "utf8");

test("the client's limits are the ones the server enforces", () => {
  assert.match(server, new RegExp(`min\\(${PASSWORD_MIN}, "Use at least ${PASSWORD_MIN} characters\\."\\)`));
  assert.match(server, new RegExp(`max\\(${PASSWORD_MAX}, "Keep the password under ${PASSWORD_MAX} characters\\."\\)`));
  assert.match(server, new RegExp(`max\\(${NAME_MAX}, "Keep the first name under ${NAME_MAX} characters\\."\\)`));
  assert.match(server, new RegExp(`max\\(${NAME_MAX}, "Keep the last name under ${NAME_MAX} characters\\."\\)`));
});

test("the client's wording is the server's wording", () => {
  for (const message of ["Enter a first name.", "Enter a last name.", "Enter a valid email address."]) {
    assert.ok(server.includes(`"${message}"`), `the server no longer says ${message}`);
  }
});

test("the role keys the form sends are still the ones stored", () => {
  assert.deepEqual(ROLES.map((r) => r.key), ["musician", "patron"]);
});
