/*
  The new-fundraisers email, and what it is allowed to write down afterwards.

  Seen live on 2026-09-11: every address on the list failed, and the job still stamped
  runs.announced_at and started the week's clock, so two fundraisers were recorded as announced to
  a list that never heard about them. What is pinned here is the rule that came out of it: a pass
  that reached nobody is history, not a send.

  The database is a small in-memory stand-in that honours the filters the job uses, and the mail
  provider is a stubbed fetch, so the job itself runs for real.
*/
import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { sendNewBoards } from "@/lib/weekly";

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Enough of the Supabase query builder for weekly.ts: filters, order, limit, update, insert. */
function fakeDb(tables: Tables) {
  const from = (table: string) => {
    const tests: ((r: Row) => boolean)[] = [];
    let patch: Row | null = null;
    let sort: { col: string; ascending: boolean } | null = null;
    let max: number | null = null;

    const rows = () => {
      let out = (tables[table] ?? []).filter((r) => tests.every((t) => t(r)));
      if (sort) {
        const { col, ascending } = sort;
        out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (ascending ? 1 : -1));
      }
      return max === null ? out : out.slice(0, max);
    };

    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => (tests.push((r) => r[col] === v), q),
      gt: (col: string, v: number) => (tests.push((r) => (r[col] as number) > v), q),
      is: (col: string, v: null) => (tests.push((r) => (r[col] ?? null) === v), q),
      in: (col: string, vs: unknown[]) => (tests.push((r) => vs.includes(r[col])), q),
      order: (col: string, o?: { ascending?: boolean }) => ((sort = { col, ascending: o?.ascending ?? true }), q),
      limit: (n: number) => ((max = n), q),
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
      update: (p: Row) => ((patch = p), q),
      insert: async (r: Row) => {
        (tables[table] ??= []).push(r);
        return { error: null };
      },
      then: (resolve: (v: { data: Row[] }) => unknown) => {
        if (patch) for (const r of rows()) Object.assign(r, patch);
        return Promise.resolve({ data: rows() }).then(resolve);
      },
    };
    return q;
  };
  return { from } as unknown as Parameters<typeof sendNewBoards>[0];
}

const NOW = new Date("2026-09-18T13:00:00Z");

const fresh = (): Tables => ({
  runs: [
    { id: "run-1", slug: "support-fall-run", title: "Fall run", kind: "tour", status: "open", starts_on: "2026-10-01", ends_on: "2026-10-20", show_count: 12, created_at: "2026-09-01", announced_at: null, acts: { name: "Gutter Hymns", slug: "gutter-hymns", city: "Brooklyn" } },
  ],
  lots: [{ run_id: "run-1", price_cents: 15000, status: "open" }],
  newsletter: [
    { email: "one@doormoney.test", first_name: "One", unsubscribe_token: "t1", unsubscribed_at: null },
    { email: "two@doormoney.test", first_name: null, unsubscribe_token: "t2", unsubscribed_at: null },
  ],
  mail_runs: [],
});

/** The mail provider: delivers to every address except the ones named. */
function provider(refuse: (to: string) => boolean) {
  return mock.method(globalThis, "fetch", async (_url: unknown, init?: { body?: unknown }) => {
    const to = (JSON.parse(String(init?.body)) as { to: string[] }).to[0]!;
    return refuse(to) ? new Response("bounced", { status: 422 }) : new Response("{}", { status: 200 });
  });
}

let quiet: ReturnType<typeof mock.method>;
const env = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

beforeEach(() => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.EMAIL_FROM = "Door Money <hello@doormoney.test>";
  quiet = mock.method(console, "error", () => {});
});

afterEach(() => {
  mock.restoreAll();
  quiet.mock.restore();
  if (env.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = env.key;
  if (env.from === undefined) delete process.env.EMAIL_FROM;
  else process.env.EMAIL_FROM = env.from;
});

test("a send that reaches the list marks the fundraiser announced and records the pass", async () => {
  const tables = fresh();
  provider(() => false);
  assert.deepEqual(await sendNewBoards(fakeDb(tables), NOW), { sent: 2, failed: 0, boards: 1 });
  assert.equal(tables.runs![0]!.announced_at, NOW.toISOString());
  assert.equal(tables.mail_runs!.length, 1);
  assert.equal(tables.mail_runs![0]!.recipients, 2);
});

test("a send that reaches nobody announces nothing, and is still written down", async () => {
  const tables = fresh();
  provider(() => true);
  assert.deepEqual(await sendNewBoards(fakeDb(tables), NOW), { sent: 0, failed: 2, boards: 1 });
  assert.equal(tables.runs![0]!.announced_at, null, "a fundraiser nobody was told about was marked announced");
  assert.deepEqual(
    tables.mail_runs!.map((m) => [m.kind, m.recipients, m.failures]),
    [["new_boards", 0, 2]],
    "the failed pass should be on the record for the admin page",
  );
});

test("a pass that reached nobody does not start the week's clock: the next day tries again", async () => {
  const tables = fresh();
  provider(() => true);
  await sendNewBoards(fakeDb(tables), NOW);

  mock.restoreAll();
  provider(() => false);
  const nextDay = new Date(NOW.getTime() + 24 * 3600 * 1000);
  assert.deepEqual(await sendNewBoards(fakeDb(tables), nextDay), { sent: 2, failed: 0, boards: 1 });
  assert.equal(tables.runs![0]!.announced_at, nextDay.toISOString());
});

test("a pass that reached somebody does start the clock: nothing goes out for a week", async () => {
  const tables = fresh();
  const fetched = provider(() => false);
  await sendNewBoards(fakeDb(tables), NOW);
  const calls = fetched.mock.callCount();

  // A second fundraiser opens the next day. It waits for the week to pass.
  tables.runs!.push({ ...tables.runs![0]!, id: "run-2", slug: "support-winter", announced_at: null });
  assert.equal(await sendNewBoards(fakeDb(tables), new Date(NOW.getTime() + 24 * 3600 * 1000)), null);
  assert.equal(fetched.mock.callCount(), calls, "mail went out inside the week");

  const result = await sendNewBoards(fakeDb(tables), new Date(NOW.getTime() + 7 * 24 * 3600 * 1000));
  assert.deepEqual(result, { sent: 2, failed: 0, boards: 1 });
});

test("when some addresses fail and some do not, the fundraiser is announced once and not again", async () => {
  // Mailing the whole list a second time to reach the one that bounced would break the promise on
  // the sign-up form. Which address failed is in the log; retrying one address is Phase 7's work.
  const tables = fresh();
  provider((to) => to.startsWith("two@"));
  assert.deepEqual(await sendNewBoards(fakeDb(tables), NOW), { sent: 1, failed: 1, boards: 1 });
  assert.equal(tables.runs![0]!.announced_at, NOW.toISOString());
});
