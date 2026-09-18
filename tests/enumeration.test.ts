/*
  The two forms that must not answer "is there an account here?".

  /forgot takes an email address or a username and sends a reset link. /login takes the same and a
  password. Both are open to anyone, so both are a way to ask whether a name has an account behind
  it unless they are careful to report the same thing either way. requestPasswordReset returns
  { ok: true } for every handle it is given, sends nothing when it finds no address, and swallows
  whatever the mail provider said. signIn gives a missing account and a wrong password the same
  sentence.

  This replaces a test that read page.tsx and ForgotPasswordForm.tsx and checked that five phrases
  ("not found", "no account", ...) did not appear in them. That guarded the wording of one page
  against one list; "We couldn't find that email" would have passed it, and it said nothing at all
  about the action, which is where the property actually lives. Retired in the testing-suite audit
  and replaced with this.

  The action is the real one. Supabase is a stub whose answers each test sets, which is what the
  mock.module call below and --experimental-test-module-mocks in the test script are for.
*/
import assert from "node:assert/strict";
import { mock, test } from "node:test";

/** What the stubbed Supabase will answer, and what it was asked. Each test sets what it needs. */
const db = {
  /** The address profiles holds for the username being looked up, or null for no such account. */
  emailForUsername: null as string | null,
  /** What resetPasswordForEmail reports back. */
  resetError: null as { message: string } | null,
  /** What signInWithPassword reports back. */
  signInError: null as { message: string } | null,
  /** Every address a reset link was actually sent to. */
  sentTo: [] as string[],
};

function reset(next: Partial<typeof db> = {}) {
  db.emailForUsername = null;
  db.resetError = null;
  db.signInError = null;
  db.sentTo = [];
  Object.assign(db, next);
}

// redirect is only reached on a successful sign-in, which none of these are.
mock.module("next/navigation", {
  namedExports: { redirect: (to: string) => { throw new Error(`unexpected redirect to ${to}`); } },
});

mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseServer: async () => ({
      auth: {
        resetPasswordForEmail: async (email: string) => {
          db.sentTo.push(email);
          return { error: db.resetError };
        },
        signInWithPassword: async () => ({ error: db.signInError }),
      },
    }),
    // emailForUsername in @/lib/username runs this chain against profiles.
    supabaseAdmin: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: db.emailForUsername ? { email: db.emailForUsername } : null }),
          }),
        }),
      }),
    }),
  },
});

const { requestPasswordReset, signIn } = await import("@/app/actions/auth");

const ask = (handle: string) => {
  const form = new FormData();
  form.set("handle", handle);
  return requestPasswordReset({ ok: false }, form);
};

const signInWith = (handle: string, password: string) => {
  const form = new FormData();
  form.set("handle", handle);
  form.set("password", password);
  return signIn({}, form);
};

/* ---------------------------------------------------------------------------------------------
   The reset form
   --------------------------------------------------------------------------------------------- */

test("a username with an account and one without get the same answer", async () => {
  reset({ emailForUsername: "rosie@example.test" });
  const real = await ask("rosie");

  reset({ emailForUsername: null });
  const invented = await ask("nobody-by-that-name");

  assert.deepEqual(real, { ok: true });
  assert.deepEqual(invented, real, "the two answers differ, so the form can be asked who exists");
});

test("the link really is sent for the account that exists, and not for the one that does not", async () => {
  // Without this the test above would pass just as well if the form sent nothing to anybody.
  reset({ emailForUsername: "rosie@example.test" });
  await ask("rosie");
  assert.deepEqual(db.sentTo, ["rosie@example.test"]);

  reset({ emailForUsername: null });
  await ask("nobody-by-that-name");
  assert.deepEqual(db.sentTo, [], "an address was looked up, not found, and something was sent anyway");
});

test("a username is normalised before it is looked up", async () => {
  reset({ emailForUsername: "rosie@example.test" });
  assert.deepEqual(await ask("  Rosie  "), { ok: true });
  assert.deepEqual(db.sentTo, ["rosie@example.test"]);
});

test("an address is taken as itself, lowercased, without a lookup", async () => {
  reset({ emailForUsername: null });
  assert.deepEqual(await ask("Rosie@Example.test"), { ok: true });
  assert.deepEqual(db.sentTo, ["rosie@example.test"]);
});

test("the mail provider refusing the address changes nothing the form says", async () => {
  const quiet = mock.method(console, "error", () => {});
  try {
    reset({ emailForUsername: "rosie@example.test", resetError: { message: "user not found" } });
    const refused = await ask("rosie");

    reset({ emailForUsername: "rosie@example.test", resetError: null });
    const accepted = await ask("rosie");

    assert.deepEqual(refused, { ok: true });
    assert.deepEqual(refused, accepted, "a failure from the mail provider reached the visitor");
    assert.equal(quiet.mock.callCount(), 1, "the failure should still reach the log");
  } finally {
    quiet.mock.restore();
  }
});

test("every handle, whatever is behind it, comes back byte for byte the same", async () => {
  const answers: string[] = [];
  for (const emailForUsername of ["rosie@example.test", null]) {
    for (const resetError of [null, { message: "rate limit exceeded" }]) {
      for (const handle of ["rosie", "nobody", "rosie@example.test", "NOBODY@example.test"]) {
        reset({ emailForUsername, resetError });
        const quiet = mock.method(console, "error", () => {});
        answers.push(JSON.stringify(await ask(handle)));
        quiet.mock.restore();
      }
    }
  }
  assert.equal(new Set(answers).size, 1, `${new Set(answers).size} different answers: ${[...new Set(answers)].join(" ")}`);
  assert.equal(answers[0], JSON.stringify({ ok: true }));
});

test("the one thing it will refuse is an empty box, which says nothing about any account", async () => {
  reset();
  const blank = await ask("   ");
  assert.equal(blank.ok, false);
  assert.match(blank.error ?? "", /Enter a username or email address/);
  assert.deepEqual(db.sentTo, [], "nothing should reach the service for an empty submission");
});

/* ---------------------------------------------------------------------------------------------
   The sign-in form, which has the same problem and solves it a different way
   --------------------------------------------------------------------------------------------- */

test("no account and the wrong password are the same sentence", async () => {
  reset({ emailForUsername: null });
  const missing = await signInWith("nobody-by-that-name", "whatever-they-typed");

  const quiet = mock.method(console, "error", () => {});
  reset({ emailForUsername: "rosie@example.test", signInError: { message: "Invalid login credentials" } });
  const wrong = await signInWith("rosie", "not-the-password");
  quiet.mock.restore();

  assert.deepEqual(missing, wrong, "a missing account and a wrong password can be told apart");
  assert.match(missing.error ?? "", /do not match an account/);
});
