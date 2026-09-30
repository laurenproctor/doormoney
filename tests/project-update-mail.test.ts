import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";

type Call = { table: string; steps: [string, unknown[]][] };
type Reply = { table: string; data: unknown; error: Error | null };
let replies: Reply[] = [];
let calls: Call[] = [];
let messages: Record<string, unknown>[] = [];
let configured = true;
let sendSucceeds = true;
const reply = (table: string, data: unknown = null, error: Error | null = null) => replies.push({ table, data, error });
const sb = { from(table: string) {
  const expected = replies.shift(); assert.ok(expected, `Unexpected query on ${table}`); assert.equal(table, expected.table);
  const call: Call = { table, steps: [] }; calls.push(call);
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "is", "not", "gte", "lte", "order", "limit", "upsert", "update", "delete", "or", "maybeSingle"]) {
    chain[method] = (...args: unknown[]) => { call.steps.push([method, args]); return chain; };
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: expected.data, error: expected.error }).then(resolve);
  return chain;
} };
mock.module("@/lib/email", { namedExports: { emailConfigured: () => configured, sendEmail: async (message: Record<string, unknown>) => { messages.push(message); return { sent: sendSucceeds }; } } });
mock.module("@/lib/site", { namedExports: { SITE: { url: "https://example.test" } } });
mock.module("@/lib/project-updates", { namedExports: { projectUpdatePath: (act: string, run: string, id: string) => `/${act}/support-${run}/updates/${id}` } });
const { runProjectUpdateMail } = await import("@/lib/project-update-mail");
const work = () => runProjectUpdateMail(sb as unknown as Parameters<typeof runProjectUpdateMail>[0]);
const has = (call: Call, method: string, ...args: unknown[]) => assert.ok(call.steps.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args)), `${method} ${JSON.stringify(args)} missing`);
const published = "2026-09-20T10:00:00.000Z";
const update = (status = "open", published_at: string | null = published) => ({ id: "update", run_id: "run", published_at, runs: { slug: "project", status, acts: { slug: "artist" } } });
const pending = () => { reply("project_updates", []); reply("project_update_mail", [{ id: "mail", update_id: "update", profile_id: "person" }]); reply("project_update_mail", { id: "mail" }); };
const recipient = (follows: unknown = [{ unsubscribe_token: "token", created_at: "2026-09-19T10:00:00.000Z" }], email: string | null = "person@example.test") => { reply("project_update_follows", follows); reply("profiles", { email }); };
beforeEach(() => { replies = []; calls = []; messages = []; configured = true; sendSucceeds = true; });
afterEach(() => assert.equal(replies.length, 0, "All scripted queries should be consumed"));

test("unconfigured email does not touch the queue", async () => {
  configured = false; assert.deepEqual(await work(), { sent: 0, reason: "email not configured" }); assert.equal(calls.length, 0);
});
test("enqueue is opt-in before publication, idempotent, and bounded", async () => {
  reply("project_updates", [update()]); reply("project_update_follows", [{ profile_id: "person" }]); reply("project_update_mail"); reply("project_update_mail", []);
  assert.deepEqual(await work(), { sent: 0 });
  has(calls[0], "not", "published_at", "is", null); has(calls[0], "limit", 100);
  has(calls[1], "eq", "run_id", "run"); has(calls[1], "lte", "created_at", published);
  has(calls[2], "upsert", [{ update_id: "update", profile_id: "person" }], { onConflict: "update_id,profile_id", ignoreDuplicates: true });
  has(calls[3], "is", "sent_at", null); has(calls[3], "limit", 10);
});
test("private projects never enqueue mail", async () => {
  reply("project_updates", [update("draft")]); reply("project_update_mail", []);
  assert.deepEqual(await work(), { sent: 0 }); assert.equal(messages.length, 0);
});
test("a claimed row is rechecked and sends a generic link with a scoped unsubscribe and stable key", async () => {
  pending(); reply("project_updates", update()); recipient(); reply("project_update_mail");
  assert.deepEqual(await work(), { sent: 1 }); assert.equal(messages.length, 1);
  const claim = calls[2]; has(claim, "eq", "id", "mail"); has(claim, "is", "sent_at", null);
  assert.match(String(claim.steps.find(([m]) => m === "or")![1][0]), /^claimed_at\.is\.null,claimed_at\.lt\./);
  has(calls[4], "eq", "profile_id", "person"); has(calls[4], "eq", "run_id", "run");
  assert.equal(messages[0].to, "person@example.test"); assert.equal(messages[0].idempotencyKey, "project-update-mail");
  assert.match(String(messages[0].text), /https:\/\/example.test\/artist\/support-project\/updates\/update/);
  assert.match(String(messages[0].html), /https:\/\/example.test\/project-updates\/unsubscribe\/token/);
  const saved = calls[6].steps.find(([m]) => m === "update")![1][0] as { sent_at: string };
  assert.ok(Number.isFinite(Date.parse(saved.sent_at)));
});
test("a row claimed elsewhere sends nothing", async () => {
  reply("project_updates", []); reply("project_update_mail", [{ id: "mail", update_id: "update", profile_id: "person" }]); reply("project_update_mail");
  assert.deepEqual(await work(), { sent: 0 }); assert.equal(messages.length, 0);
});
for (const reason of ["unfollowed", "refollowed later", "unpublished", "private", "no email"]) test(`${reason} is rechecked after enqueue and suppresses delivery`, async () => {
  pending(); reply("project_updates", update(reason === "private" ? "draft" : "closed", reason === "unpublished" ? null : published));
  recipient(reason === "unfollowed" ? [] : [{ unsubscribe_token: "token", created_at: reason === "refollowed later" ? "2026-09-21T10:00:00.000Z" : "2026-09-19T10:00:00.000Z" }], reason === "no email" ? null : "person@example.test");
  reply("project_update_mail"); assert.deepEqual(await work(), { sent: 0 }); assert.equal(messages.length, 0);
  has(calls[6], "delete"); has(calls[6], "eq", "id", "mail");
});
test("provider failure leaves the row unsent for a later retry", async () => {
  sendSucceeds = false; pending(); reply("project_updates", update("cancelled")); recipient();
  assert.deepEqual(await work(), { sent: 0 }); assert.equal(messages.length, 1); assert.equal(calls.length, 6);
});
test("a database error listing updates propagates", async () => {
  const error = new Error("read failed"); reply("project_updates", null, error); await assert.rejects(work, error);
});
for (const table of ["project_update_follows", "profiles"]) test(`failed ${table} revalidation does not discard pending delivery`, async () => {
  pending(); reply("project_updates", update());
  const error = new Error("read failed");
  reply("project_update_follows", table === "project_update_follows" ? null : [{ unsubscribe_token: "token", created_at: "2026-09-19T10:00:00.000Z" }], table === "project_update_follows" ? error : null);
  reply("profiles", table === "profiles" ? null : { email: "person@example.test" }, table === "profiles" ? error : null);
  await assert.rejects(work, error); assert.equal(messages.length, 0); assert.ok(calls.every(c => c.steps.every(([m]) => m !== "delete")));
});
test("failure to record a sent message propagates rather than counting a persisted success", async () => {
  pending(); reply("project_updates", update()); recipient(); const error = new Error("write failed"); reply("project_update_mail", null, error);
  await assert.rejects(work, error); assert.equal(messages.length, 1);
});
for (const stage of ["follower list", "enqueue", "pending", "claim", "update", "discard"]) test(`a failed ${stage} query propagates for retry`, async () => {
  const error = new Error(`${stage} failed`);
  if (stage === "follower list" || stage === "enqueue") {
    reply("project_updates", [update()]);
    reply("project_update_follows", stage === "follower list" ? null : [{ profile_id: "person" }], stage === "follower list" ? error : null);
    if (stage === "enqueue") reply("project_update_mail", null, error);
  } else if (stage === "pending" || stage === "claim") {
    reply("project_updates", []);
    reply("project_update_mail", stage === "pending" ? null : [{ id: "mail", update_id: "update", profile_id: "person" }], stage === "pending" ? error : null);
    if (stage === "claim") reply("project_update_mail", null, error);
  } else {
    pending(); reply("project_updates", stage === "update" ? null : update(), stage === "update" ? error : null);
    if (stage === "discard") { recipient([]); reply("project_update_mail", null, error); }
  }
  await assert.rejects(work, error); assert.equal(messages.length, 0);
});
