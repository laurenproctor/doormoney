/*
  What the one-time link form posts, and what the action makes of it.

  The link form sends an email and a destination and nothing else. On 2026-09-22 the action's
  schema grew an intent field the form does not send, the action read it straight off the form,
  FormData.get answered null, and zod refused every request with its own sentence. No link was
  sent for a day and nothing was logged, because the refusal happened before Supabase was asked.
  readLinkRequest in src/lib/login.ts is the reading, kept pure so this file can post forms at it.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_MESSAGES, readLinkRequest } from "@/lib/login";

const form = (fields: Record<string, string>): FormData => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

test("the form the page actually posts is accepted: an email and a destination, no intent", () => {
  const r = readLinkRequest(form({ email: "Rosie@Example.com", next: "/dashboard" }));
  assert.deepEqual(r, { ok: true, email: "rosie@example.com", next: "/dashboard", intent: null });
});

test("an email alone is enough", () => {
  const r = readLinkRequest(form({ email: "rosie@example.com" }));
  assert.deepEqual(r, { ok: true, email: "rosie@example.com", next: undefined, intent: null });
});

test("a real intent is kept and an unknown one is dropped, never refused", () => {
  const kept = readLinkRequest(form({ email: "rosie@example.com", intent: "creator" }));
  assert.equal(kept.ok && kept.intent, "creator");
  const dropped = readLinkRequest(form({ email: "rosie@example.com", intent: "nonsense" }));
  assert.equal(dropped.ok && dropped.intent, null);
});

test("an empty destination reads as none, so the fallback decides", () => {
  const r = readLinkRequest(form({ email: "rosie@example.com", next: "" }));
  assert.equal(r.ok && r.next, undefined);
});

test("a missing or malformed email is refused in our own words", () => {
  assert.deepEqual(readLinkRequest(form({})), { ok: false, error: LOGIN_MESSAGES.email_missing });
  assert.deepEqual(readLinkRequest(form({ email: "   " })), { ok: false, error: LOGIN_MESSAGES.email_missing });
  assert.deepEqual(readLinkRequest(form({ email: "not-an-address" })), { ok: false, error: LOGIN_MESSAGES.email_invalid });
});

test("no refusal ever carries the library's sentence", () => {
  const attempts = [form({}), form({ email: "x" }), form({ email: "rosie@example.com", intent: "" })];
  for (const f of attempts) {
    const r = readLinkRequest(f);
    if (!r.ok) assert.doesNotMatch(r.error, /invalid input|expected string|received null/i);
  }
});
