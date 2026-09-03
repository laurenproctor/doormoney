/*
  Cancel a run from the command line, the way the dashboard does but without an owner signed in.
  For Door Money staff: a seeded act, an act that has lost access, or a run that has to come down now.

    npx tsx --env-file=.env.local scripts/cancel-run.ts <run id>

  Every open spot comes off the board, every patron gets the unreleased part back with a note,
  and any checkout in progress is closed. Needs STRIPE_SECRET_KEY and the service role key.
*/
import { cancelRun } from "@/lib/refunds";
import { supabaseAdmin } from "@/lib/supabase/server";

const runId = process.argv[2];
if (!runId) {
  console.error("usage: npx tsx --env-file=.env.local scripts/cancel-run.ts <run id>");
  process.exit(2);
}

cancelRun(supabaseAdmin(), runId).then((r) => {
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 1);
});
