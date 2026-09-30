import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

const USER = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const UPDATE = "33333333-3333-4333-8333-333333333333";
const PURCHASE = "44444444-4444-4444-8444-444444444444";
const TOKEN = "55555555-5555-4555-8555-555555555555";
const SPONSOR = "66666666-6666-4666-8666-666666666666";
const DEST = "/artist/support-project/updates";
type Call = { table: string; steps: [string, unknown[]][] };
type Reply = { table: string; data: unknown; error: Error | null };
let replies: Reply[] = [];
let calls: Call[] = [];
let revalidated: string[] = [];
let emails: Record<string, unknown>[] = [];
let owned = true;
let authCalls = 0;
const reply = (table: string, data: unknown = null, error: Error | null = null) => replies.push({ table, data, error });
const sb = { from(table: string) {
  const expected = replies.shift();
  assert.ok(expected, `Unexpected query on ${table}`);
  assert.equal(table, expected.table);
  const call: Call = { table, steps: [] }; calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "limit", "insert", "upsert", "update", "delete", "maybeSingle", "single"]) {
    chain[method] = (...args: unknown[]) => { call.steps.push([method, args]); return chain; };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: expected.data, error: expected.error }).then(resolve);
  return chain;
} };
mock.module("next/cache", { namedExports: { revalidatePath: (path: string) => revalidated.push(path) } });
mock.module("next/navigation", { namedExports: { redirect: (path: string) => { throw new Error(`redirect:${path}`); } } });
mock.module("@/lib/auth", { namedExports: { requireUser: async () => { authCalls++; return { id: USER }; } } });
mock.module("@/lib/supabase/server", { namedExports: { supabaseAdmin: () => sb } });
mock.module("@/lib/email", { namedExports: { sendEmail: async (message: Record<string, unknown>) => { emails.push(message); return { sent: true }; } } });
mock.module("@/lib/site", { namedExports: { SITE: { url: "https://example.test" } } });
mock.module("@/lib/project-updates", { namedExports: {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  projectById: async (id: string, owner: string) => { assert.equal(id, RUN); assert.equal(owner, USER); return owned ? { id: RUN } : null; },
  projectUpdatePath: (act: string, run: string, id: string) => `/${act}/support-${run}/updates/${id}`,
} });
const { setProjectFollow, unsubscribeProjectFollow } = await import("@/app/actions/project-follows");
const { requestProjectRecognition, decideProjectRecognition } = await import("@/app/actions/project-recognition");
const form = (values: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; };
const redirected = async (action: () => Promise<unknown>, path: string) => assert.rejects(action, { message: `redirect:${path}` });
const has = (call: Call, method: string, ...args: unknown[]) => assert.ok(call.steps.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args)), `${method} ${JSON.stringify(args)} missing`);
const run = (owner = SPONSOR) => reply("runs", { id: RUN, slug: "project", acts: { slug: "artist", owner_id: owner } });
const recognitionStart = (profile: string | null = SPONSOR, mark = "approved") => {
  reply("project_updates", { id: UPDATE, run_id: RUN });
  reply("purchases", { id: PURCHASE, lot_id: "lot", patron_id: "patron", mark_status: mark, mark_url: "https://example.test/logo.png", patrons: { profile_id: profile } });
};
const recognitionForm = () => form({ update: UPDATE, purchase: PURCHASE, name: "  Sponsor  ", logo: "yes" });
const back = `/dashboard/runs/${RUN}?tab=updates&edit=${UPDATE}`;
beforeEach(() => { replies = []; calls = []; revalidated = []; emails = []; owned = true; authCalls = 0; });
afterEach(() => assert.equal(replies.length, 0, "All scripted queries should be consumed"));

test("invalid follow IDs never reach auth or the database", async () => {
  await redirected(() => setProjectFollow(form({ run: "bad", intent: "follow" })), "/fundraisers");
  assert.equal(authCalls, 0); assert.equal(calls.length, 0);
});
test("following is explicit, scoped to the session, and preserves existing token/timestamp", async () => {
  run(); reply("project_update_follows");
  await redirected(() => setProjectFollow(form({ run: RUN, intent: "follow", profile_id: SPONSOR })), DEST);
  has(calls[0], "in", "status", ["open", "live", "closed", "cancelled"]);
  has(calls[1], "upsert", { run_id: RUN, profile_id: USER }, { onConflict: "run_id,profile_id", ignoreDuplicates: true });
  assert.deepEqual(revalidated, [DEST]);
});
test("an organizer cannot follow their own project", async () => {
  run(USER); await redirected(() => setProjectFollow(form({ run: RUN, intent: "follow" })), DEST);
  assert.equal(calls.length, 1);
});
test("unfollowing removes only this user's project queue", async () => {
  run(); reply("project_update_follows"); reply("project_updates", [{ id: UPDATE }]); reply("project_update_mail");
  await redirected(() => setProjectFollow(form({ run: RUN, intent: "unfollow" })), DEST);
  has(calls[1], "eq", "profile_id", USER); has(calls[1], "eq", "run_id", RUN);
  has(calls[3], "eq", "profile_id", USER); has(calls[3], "in", "update_id", [UPDATE]);
});
test("token unsubscribe needs no login and clears only its subscription's queued mail", async () => {
  reply("project_update_follows", { run_id: RUN, profile_id: SPONSOR }); reply("project_update_follows"); reply("project_updates", [{ id: UPDATE }]); reply("project_update_mail");
  await redirected(() => unsubscribeProjectFollow(form({ token: TOKEN, profile_id: USER })), "/project-updates/unsubscribed");
  assert.equal(authCalls, 0); has(calls[1], "eq", "unsubscribe_token", TOKEN);
  has(calls[3], "eq", "profile_id", SPONSOR); has(calls[3], "in", "update_id", [UPDATE]);
});
test("unknown token unsubscribe is idempotent", async () => {
  reply("project_update_follows");
  await redirected(() => unsubscribeProjectFollow(form({ token: TOKEN })), "/project-updates/unsubscribed");
});
test("failed token lookup must not report that emails stopped", async () => {
  const error = new Error("database unavailable"); reply("project_update_follows", null, error);
  await assert.rejects(() => unsubscribeProjectFollow(form({ token: TOKEN })), error);
});
test("failed unsubscribe delete must not report success", async () => {
  reply("project_update_follows", { run_id: RUN, profile_id: SPONSOR });
  const error = new Error("delete failed"); reply("project_update_follows", null, error);
  await assert.rejects(() => unsubscribeProjectFollow(form({ token: TOKEN })), error);
});
test("recognition requires organizer ownership before any purchase lookup", async () => {
  owned = false; reply("project_updates", { id: UPDATE, run_id: RUN });
  await redirected(() => requestProjectRecognition(recognitionForm()), "/dashboard/runs");
  assert.equal(emails.length, 0);
});
for (const profile of [null, USER]) test(`recognition rejects ${profile ? "self recognition" : "an unlinked patron"}`, async () => {
  recognitionStart(profile); await redirected(() => requestProjectRecognition(recognitionForm()), `${back}&error=recognition`);
});
test("anonymous sponsorship cannot become public recognition", async () => {
  recognitionStart(); reply("bids", [{ id: "anonymous-bid" }]);
  await redirected(() => requestProjectRecognition(recognitionForm()), `${back}&error=recognition`);
  has(calls[1], "eq", "lots.run_id", RUN); has(calls[1], "in", "payment_status", ["held", "released", "partially_refunded"]);
  has(calls[2], "eq", "anonymous", true); assert.equal(emails.length, 0);
});
test("an anonymity lookup failure fails closed", async () => {
  recognitionStart(); reply("bids", null, new Error("database unavailable"));
  await redirected(() => requestProjectRecognition(recognitionForm()), `${back}&error=recognition`);
  assert.equal(emails.length, 0);
});
for (const mark of ["approved", "pending"]) test(`request snapshots consent with ${mark} logo and does not approve it`, async () => {
  recognitionStart(SPONSOR, mark); reply("bids", []); reply("project_update_recognition", { id: TOKEN }); reply("profiles", { email: "sponsor@example.test" });
  await redirected(() => requestProjectRecognition(recognitionForm()), back);
  has(calls[3], "insert", { update_id: UPDATE, purchase_id: PURCHASE, sponsor_id: SPONSOR, display_name: "Sponsor", logo_url: mark === "approved" ? "https://example.test/logo.png" : null });
  assert.equal(emails.length, 1); assert.equal(emails[0].to, "sponsor@example.test");
  assert.match(String(emails[0].text), new RegExp(`/project-recognition/${TOKEN}`));
});
for (const intent of ["approve", "withdraw"]) test(`${intent} is sponsor-scoped and revalidates the public update`, async () => {
  reply("project_update_recognition", { id: TOKEN, update_id: UPDATE, project_updates: { run_id: RUN } }); reply("project_update_recognition"); reply("runs", { slug: "project", acts: { slug: "artist" } });
  await redirected(() => decideProjectRecognition(form({ id: TOKEN, intent, sponsor_id: SPONSOR })), `/project-recognition/${TOKEN}`);
  has(calls[0], "eq", "sponsor_id", USER); has(calls[1], "eq", "sponsor_id", USER);
  const values = calls[1].steps.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
  assert.equal(values[intent === "approve" ? "withdrawn_at" : "approved_at"], null);
  assert.ok(Number.isFinite(Date.parse(String(values[intent === "approve" ? "approved_at" : "withdrawn_at"]))));
  assert.ok(revalidated.includes(`${DEST}/${UPDATE}`));
});
test("a different sponsor cannot approve another person's mention", async () => {
  reply("project_update_recognition"); await redirected(() => decideProjectRecognition(form({ id: TOKEN, intent: "approve" })), "/dashboard");
  assert.equal(calls.length, 1);
});
test("failed follow write reports failure without revalidating success", async () => {
  run(); reply("project_update_follows", null, new Error("write failed"));
  await redirected(() => setProjectFollow(form({ run: RUN, intent: "follow" })), `${DEST}?follow=error`);
  assert.deepEqual(revalidated, []);
});
test("failed unfollow delete reports failure before touching queued mail", async () => {
  run(); reply("project_update_follows", null, new Error("delete failed"));
  await redirected(() => setProjectFollow(form({ run: RUN, intent: "unfollow" })), `${DEST}?follow=error`);
  assert.deepEqual(revalidated, []);
});
test("invalid unsubscribe tokens cannot query subscriptions", async () => {
  await redirected(() => unsubscribeProjectFollow(form({ token: "bad" })), "/fundraisers");
  assert.equal(calls.length, 0);
});
test("failed recognition decision never revalidates as approved", async () => {
  reply("project_update_recognition", { id: TOKEN, update_id: UPDATE, project_updates: { run_id: RUN } });
  reply("project_update_recognition", null, new Error("save failed"));
  await redirected(() => decideProjectRecognition(form({ id: TOKEN, intent: "approve" })), `/project-recognition/${TOKEN}?error=save`);
  assert.deepEqual(revalidated, []);
});
