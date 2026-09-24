/*
  Who is Door Money staff.

  Until 2026-09-23 the gate asked one question, is the address on ADMIN_EMAILS, and the local
  Supabase config has email confirmation off, so signing up with a listed address was enough to
  reach /admin and the service-role actions behind it. The gate asks two now: listed, and
  confirmed. isAdminUser is the decision, requireAdmin is the door every staff page and action
  goes through, and the actions refuse on their own before reading a form.
*/
import assert from "node:assert/strict";
import { beforeEach, mock, test } from "node:test";

type StubUser = { id: string; email?: string | null; email_confirmed_at?: string | null };
let sessionUser: StubUser = { id: "u1", email: "staff@example.com", email_confirmed_at: "2026-09-01T00:00:00Z" };
let databaseTouched = 0;

class NotFound extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

mock.module("next/navigation", {
  namedExports: {
    notFound() {
      throw new NotFound();
    },
    redirect(to: string) {
      throw new Error(`redirect:${to}`);
    },
  },
});
mock.module("next/cache", { namedExports: { revalidatePath() {} } });
// What requireUser answers: the account as Supabase's auth.getUser() reports it, never a cookie.
mock.module("@/lib/auth", { namedExports: { requireUser: async () => sessionUser } });
mock.module("@/lib/supabase/server", {
  namedExports: {
    supabaseAdmin: () => {
      databaseTouched += 1;
      throw new Error("the service role must not be reached by a refused caller");
    },
    supabaseServer: async () => {
      throw new Error("not used here");
    },
  },
});
mock.module("@/lib/flags", {
  namedExports: {
    clearFlag: async () => {
      databaseTouched += 1;
      return { resumed: 0 };
    },
    flagTarget: async () => null,
    raiseFlag: async () => ({ paused: 0, already: false }),
  },
});

const { isAdminUser, parseAdminEmails, adminEmails, requireAdmin } = await import("@/lib/admin");
const { removeAccountTotp } = await import("@/app/actions/admin-mfa");
const { clearPatronFlag } = await import("@/app/actions/flags");

const CONFIRMED = "2026-09-01T00:00:00Z";
const staff = parseAdminEmails("staff@example.com");

beforeEach(() => {
  process.env.ADMIN_EMAILS = "staff@example.com";
  sessionUser = { id: "u1", email: "staff@example.com", email_confirmed_at: CONFIRMED };
  databaseTouched = 0;
});

test("a listed, confirmed address is staff", () => {
  assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: CONFIRMED }, staff), true);
});

test("a listed address that was never confirmed is not staff", () => {
  assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: null }, staff), false);
  assert.equal(isAdminUser({ email: "staff@example.com" }, staff), false);
  assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: "" }, staff), false);
});

test("a confirmed address that is not listed is not staff", () => {
  assert.equal(isAdminUser({ email: "someone@example.com", email_confirmed_at: CONFIRMED }, staff), false);
  assert.equal(isAdminUser({ email: null, email_confirmed_at: CONFIRMED }, staff), false);
  assert.equal(isAdminUser(null, staff), false);
});

test("case and surrounding whitespace do not decide it, on either side", () => {
  const list = parseAdminEmails("  Staff@Example.COM , second@example.com,, ,");
  assert.deepEqual([...list], ["staff@example.com", "second@example.com"]);
  assert.equal(isAdminUser({ email: " STAFF@example.com ", email_confirmed_at: CONFIRMED }, list), true);
  assert.equal(isAdminUser({ email: "Second@Example.com", email_confirmed_at: CONFIRMED }, list), true);
});

test("an empty or missing ADMIN_EMAILS lets nobody in", () => {
  for (const raw of ["", "  ", " , ,", undefined]) {
    assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: CONFIRMED }, parseAdminEmails(raw)), false);
  }
  delete process.env.ADMIN_EMAILS;
  assert.equal(adminEmails().size, 0);
  assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: CONFIRMED }), false);
  process.env.ADMIN_EMAILS = "   ";
  assert.equal(isAdminUser({ email: "staff@example.com", email_confirmed_at: CONFIRMED }), false);
});

test("requireAdmin answers the confirmed, listed account and 404s everyone else", async () => {
  assert.equal((await requireAdmin()).id, "u1");
  sessionUser = { id: "u1", email: "staff@example.com", email_confirmed_at: null };
  await assert.rejects(requireAdmin, NotFound);
  sessionUser = { id: "u2", email: "someone@example.com", email_confirmed_at: CONFIRMED };
  await assert.rejects(requireAdmin, NotFound);
});

test("removing another account's two-factor app refuses a listed but unconfirmed caller before touching anything", async () => {
  sessionUser = { id: "u1", email: "staff@example.com", email_confirmed_at: null };
  const form = new FormData();
  form.set("email", "victim@example.com");
  await assert.rejects(removeAccountTotp({ ok: false }, form), NotFound);
  assert.equal(databaseTouched, 0);
});

test("clearing a flag refuses the same caller before reading the id", async () => {
  sessionUser = { id: "u1", email: "staff@example.com", email_confirmed_at: null };
  await assert.rejects(clearPatronFlag("purchase" as never, "11111111-1111-4111-8111-111111111111"), NotFound);
  assert.equal(databaseTouched, 0);
});
