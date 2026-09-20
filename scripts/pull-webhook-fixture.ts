/*
  Save a delivered Stripe event as a test fixture, straight from stripe_events.

    npx tsx --env-file=.env.local scripts/pull-webhook-fixture.ts <event id> [name]

  Read the fixture from the database, never from `GET /v1/events`. An event retrieved through the
  API is rendered at the account's default API version *at the time the event occurred*, and this
  account's default is still 2014-03-13, so an API retrieve hands back the old shape however the
  endpoint is pinned. The stripe_events row holds the body the endpoint was actually sent.

  Migration 0039 added the payload column. Rows older than it have nothing to save.
*/
import { writeFileSync } from "node:fs";
import path from "node:path";
import { supabaseAdmin } from "@/lib/supabase/server";

const eventId = process.argv[2];
const name = process.argv[3];
if (!eventId) {
  console.error("usage: npx tsx --env-file=.env.local scripts/pull-webhook-fixture.ts <event id> [name]");
  process.exit(2);
}

async function pull(id: string): Promise<string> {
  const { data, error } = await supabaseAdmin().from("stripe_events").select("id,type,api_version,payload").eq("id", id).maybeSingle();
  if (error) throw new Error(`could not read ${id}: ${error.message}`);
  if (!data) throw new Error(`no stripe_events row for ${id}. Stripe never delivered it, or the signature failed.`);
  if (!data.payload) throw new Error(`${id} has no stored payload; it predates migration 0039 and cannot be used as a fixture.`);

  const file = path.join("tests", "fixtures", `${name ?? data.type}.json`);
  writeFileSync(file, `${JSON.stringify(data.payload, null, 2)}\n`);
  return `${file}  type=${data.type}  api_version=${data.api_version ?? "null"}`;
}

pull(eventId).then(
  (line) => console.log(line),
  (e: Error) => {
    console.error(e.message);
    process.exit(1);
  },
);
