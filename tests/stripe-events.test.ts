/*
  What a webhook event makes Door Money do, run against bodies Stripe actually delivered.

  The fixtures in tests/fixtures are the payloads stored in stripe_events, not hand-written objects
  and not events pulled back through `GET /v1/events`. That matters more than it sounds. Until
  2026-09-20 the endpoint had no api_version of its own, so it inherited the account default of
  2014-03-13 and every event arrived in a twelve-year-old shape. A fixture recorded then would have
  frozen that shape into the repo and kept the suite green through exactly the bugs it was meant to
  catch. Two tests here guard against that: one pins the version every fixture was recorded at, and
  one pins the presence of checkout.session.payment_status, the field the old shape dropped.

  Record a fixture with scripts/pull-webhook-fixture.ts, which reads the delivered body out of the
  database for that reason.

  Nothing here talks to Postgres or Stripe. src/lib/email.ts is left real: it sends nothing without
  RESEND_API_KEY, which the test run does not set. The guards decide whether money moves, so what is
  pinned is the decision: the client passed in refuses to be touched at all, which is how a test can
  say "it returned before it reached the database" rather than "it happened to do nothing".
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mock, test } from "node:test";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/** The version tests/fixtures were recorded at, and the one src/lib/stripe.ts pins. */
const PINNED = "2026-08-26.dahlia";

const backings: Stripe.PaymentIntent[] = [];
const lots: Stripe.Checkout.Session[] = [];
const released: Stripe.Checkout.Session[] = [];
let backingOutcome: { ok: boolean; reason?: string } = { ok: true };
let lotOutcome: { ok: boolean; reason?: string } = { ok: true };

mock.module("@/lib/backings", {
  namedExports: {
    fulfilBacking: async (_sb: unknown, pi: Stripe.PaymentIntent) => {
      backings.push(pi);
      return backingOutcome;
    },
    dropBacking: async () => {},
  },
});
mock.module("@/lib/purchases", {
  namedExports: {
    fulfilLotPurchase: async (_sb: unknown, session: Stripe.Checkout.Session) => {
      lots.push(session);
      return lotOutcome;
    },
    releaseLot: async (_sb: unknown, session: Stripe.Checkout.Session) => {
      released.push(session);
    },
    lotName: async () => "",
    ownerEmail: async () => null,
  },
});

const { applyStripeEvent } = await import("@/lib/stripeEvents");

function fixture(name: string): Stripe.Event {
  return JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", `${name}.json`), "utf8")) as Stripe.Event;
}

const session = (event: Stripe.Event) => event.data.object as Stripe.Checkout.Session;
const intent = (event: Stripe.Event) => event.data.object as Stripe.PaymentIntent;

/**
 * A Supabase client that throws the moment anything reads a property off it. A handler that
 * returns before touching it proves the guard ran first, which a client returning empty rows
 * cannot prove.
 */
const noDatabase = new Proxy(
  {},
  {
    get(_target, prop) {
      throw new Error(`the handler reached the database (.${String(prop)}) when the guard should have returned first`);
    },
  },
) as unknown as SupabaseClient;

function reset() {
  backings.length = 0;
  lots.length = 0;
  released.length = 0;
  backingOutcome = { ok: true };
  lotOutcome = { ok: true };
}

for (const name of ["payment_intent.succeeded", "checkout.session.completed"]) {
  test(`the ${name} fixture is a real delivery, recorded at the pinned API version`, () => {
    const event = fixture(name);
    assert.equal(event.object, "event");
    assert.equal(event.type, name);
    assert.equal(event.livemode, false);
    assert.equal(
      event.api_version,
      PINNED,
      `this fixture came from an endpoint that is not pinned to ${PINNED}; re-record it with scripts/pull-webhook-fixture.ts once the endpoint is fixed`,
    );
  });
}

test("a delivered checkout session still carries payment_status", () => {
  // The guard below is the only thing standing between an unpaid session and a fulfilled
  // sponsorship, and it is a comparison against a field. Rendered at 2014-03-13 the session had no
  // such field, the comparison was false, and the guard fell through. If this ever fails, the
  // endpoint has drifted off its pinned version and the unpaid guard is no longer doing anything.
  const paid = session(fixture("checkout.session.completed"));
  assert.ok("payment_status" in paid, "the session has no payment_status: the endpoint is rendering an older shape");
  assert.equal(paid.payment_status, "paid");
});

test("an unpaid session is ignored before the database is touched, even when it is a lot", async () => {
  reset();
  const event = fixture("checkout.session.completed");
  // Everything else says fulfil. Only payment_status says no, which is the point.
  session(event).payment_status = "unpaid";
  session(event).metadata = { kind: "lot", purchase_id: "p1", lot_id: "l1", act_id: "a1", act_slug: "act" };

  assert.equal(await applyStripeEvent(noDatabase, event), "ignored");
  assert.equal(lots.length, 0, "an unpaid session was fulfilled");
});

test("a paid session from another integration is ignored", async () => {
  reset();
  const event = fixture("checkout.session.completed");
  assert.deepEqual(session(event).metadata, {}, "fixture drifted: this session used to carry no metadata");

  assert.equal(await applyStripeEvent(noDatabase, event), "ignored");
  assert.equal(lots.length, 0);
});

test("a paid lot session is fulfilled", async () => {
  reset();
  const event = fixture("checkout.session.completed");
  session(event).metadata = { kind: "lot", purchase_id: "p1", lot_id: "l1", act_id: "a1", act_slug: "act" };

  assert.equal(await applyStripeEvent(noDatabase, event), "processed");
  assert.equal(lots.length, 1);
  assert.equal(lots[0]!.id, session(event).id);
});

test("a lot that cannot be fulfilled throws, so Stripe sends the event again", async () => {
  reset();
  lotOutcome = { ok: false, reason: "lot already sold" };
  const event = fixture("checkout.session.completed");
  session(event).metadata = { kind: "lot", purchase_id: "p1", lot_id: "l1" };

  // Returning "ignored" here would tell the route to answer 200, and a patron who paid would
  // never get the spot.
  await assert.rejects(() => applyStripeEvent(noDatabase, event), /lot already sold/);
});

test("a payment intent from another integration is ignored before the database is touched", async () => {
  reset();
  const event = fixture("payment_intent.succeeded");
  assert.deepEqual(intent(event).metadata, {}, "fixture drifted: this payment intent used to carry no metadata");

  assert.equal(await applyStripeEvent(noDatabase, event), "ignored");
  assert.equal(backings.length, 0, "a payment intent with no kind was treated as a backing");
});

test("a payment intent marked as a backing is fulfilled", async () => {
  reset();
  const event = fixture("payment_intent.succeeded");
  intent(event).metadata = { kind: "backing", backing_id: "b1", run_id: "r1", act_id: "a1", act_slug: "act", tier: "name" };

  assert.equal(await applyStripeEvent(noDatabase, event), "processed");
  assert.equal(backings.length, 1);
  assert.equal(backings[0]!.id, intent(event).id);
});

test("a backing that cannot be fulfilled throws, so Stripe sends the event again", async () => {
  reset();
  backingOutcome = { ok: false, reason: "no such backing" };
  const event = fixture("payment_intent.succeeded");
  intent(event).metadata = { kind: "backing", backing_id: "b1" };

  await assert.rejects(() => applyStripeEvent(noDatabase, event), /no such backing/);
});
