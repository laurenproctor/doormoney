/*
  What the sign-up form refuses before it posts, and the ids the messages hang on.

  The server is the authority: SignUpInput in src/app/actions/auth.ts parses the same fields again
  and nothing reaches Supabase without passing it. src/lib/signup.ts is what the page runs so it
  can answer at once, and it is also where the limits and the messages are defined: auth.ts
  imports them, so the two cannot disagree about a number or a sentence.

  What is still two implementations is the checking. The client copy is deliberately the looser
  one: a value it accepts and the server refuses comes back as a server error the form shows,
  while the reverse would be a field nobody can submit at all.
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
   The two copies of the rules, and what is left of them.

   There used to be two tests here that read src/app/actions/auth.ts as text and matched its zod
   calls with regular expressions, because the limits and the messages were written out in both
   files and nothing but a test held them together. auth.ts imports them from @/lib/signup now, so
   there is one copy and the drift those tests watched for cannot happen.

   This is the one line of that worth keeping. It does not check the wording, which is no longer
   duplicated, only that the server still reads the shared module rather than going back to
   literals of its own. Matching an import is stable in a way that matching a zod call is not.
   --------------------------------------------------------------------------------------------- */

const server = readFileSync(path.join(import.meta.dirname, "..", "src", "app", "actions", "auth.ts"), "utf8");

test("the server reads its limits and its wording from the module the page runs", () => {
  assert.match(server, /import \{[^}]*SIGNUP_MESSAGES[^}]*\} from "@\/lib\/signup";/);
  for (const name of ["NAME_MAX", "PASSWORD_MAX", "PASSWORD_MIN"]) {
    assert.match(server, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from "@\\/lib\\/signup";`), name);
  }
  // The literals those names replaced, back in the file, would mean the copies have split again.
  for (const gone of ['"Enter a first name."', '"Use at least 10 characters."', "max(60,", "min(10,"]) {
    assert.ok(!server.includes(gone), `auth.ts writes its own ${gone} again`);
  }
});
