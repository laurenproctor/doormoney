# Door Money

Door Money connects sponsors with relevant audiences, starting with music, sports teams, film, and theater. The product is city-agnostic and designed to expand to as many categories as can sustain a clear, deliverable sponsorship promise. Every sponsorship explains what the funding enables and what the sponsor can count on receiving.

NYC may be a source of early testers, not a limit on who the product is for. The technology must support new categories and locations without rebuilding the shared sponsorship workflow. Payment availability remains explicit about the countries and currencies actually supported.

Start with `CLAUDE.md` and `docs/PRODUCT_CONTRACT.md`. Follow `docs/EXPANSION_PLAN.md` for the current five-phase expansion. The application currently implements the music workflow; the broader categories are the implementation target, not a claim of live availability. `docs/ROADMAP.md` records the original music build.

## Run it

```bash
nvm use        # Node 24, the version .nvmrc names
npm ci
npm run dev
```

Opens on http://localhost:3000. With no `.env.local` the app serves two sample fundraisers from memory (`src/lib/sample.ts`) and the forms accept what is typed without saving it. No accounts needed.

## Check it

```bash
npm run verify           # lint, typecheck, unit tests, production build
npm run test:db:docker   # the database suites, in a throwaway Postgres container (needs Docker)
```

CI runs both on every pull request, with no secrets and no way to reach a live service. The database gate applies every migration and the seed to a bare Postgres, runs every `supabase/tests/*_test.sql` suite, then races two sessions against each other for the things one session cannot show (`supabase/tests/concurrency_test.sh`).

`npm run typecheck` runs `next typegen` first, because the route types it needs do not exist in a fresh checkout.

## Connect it

1. **Supabase.** Create a project, then `supabase link --project-ref <ref>` and `supabase db push`. That applies every file in `supabase/migrations/` in order and records each one in the project's migration ledger. Add `--include-seed` for the two sample musicians.
   - If the CLI answers 403, it is signed in to an account that cannot see the project. `supabase projects list` shows what it can see; `supabase login` fixes it.
   - A migration pasted into the dashboard SQL editor changes the database and not the ledger. Tell the ledger afterwards with `supabase migration repair --status applied <number>`, or the next push will try it again.
   - `0036` schedules a job through `pg_cron` and `pg_net`. Where either is missing it says so and installs nothing.
2. **Stripe.** Test mode, Connect enabled with Express accounts. The webhook lives at `/api/stripe/webhook`. Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`, and put the signing secret it prints in `STRIPE_WEBHOOK_SECRET`. In production, subscribe the endpoint to the events the handler switches on in `src/app/api/stripe/webhook/route.ts`.
3. **Resend.** An API key and a verified sender. Without both, every send is skipped and logged. Supabase Auth's own emails (confirmation, magic link, password reset) go out through Resend's SMTP, which is set in the Supabase dashboard under Authentication, not here.
4. **`cp .env.example .env.local`** and fill it in. `npm run dev` now reads and writes the real project, so point it at one that is safe to write to.
5. **Deploy.** Vercel builds `main`. Every variable on the Vercel project is marked sensitive, which means neither the dashboard nor `vercel env pull` will ever show a value again. Keep your own copy.

### The work that runs on a clock

Three callers, one secret. Each sends `Authorization: Bearer $CRON_SECRET`, and each route answers 401 without it.

| Route | Caller | When | What |
| --- | --- | --- | --- |
| `/api/cron/daily` | Vercel Cron (`vercel.json`) | daily, 13:00 UTC | the auction pass, the weekly mail, logo reminders, the refund queue |
| `/api/cron/payouts` | Vercel Cron | Fridays, 14:00 UTC | the week's transfers to musicians |
| `/api/cron/auctions` | the database (migration 0036) | every five minutes | closes auctions, rolls lapsed offers |

The third one reads its URL and the secret from Supabase Vault and makes no request until both exist. `docs/PHASE_3_DEPLOYMENT.md` has the two statements. If `CRON_SECRET` is ever changed in Vercel, change `cron_secret` in Vault in the same sitting, or the five-minute worker starts collecting 401s.

## Migrations

- Append only. An applied migration is never edited; a mistake is fixed by the next number.
- One number, once. Two branches that each write the same number is how one of them silently never runs. `tests/reserved-names.test.ts` refuses a duplicate once both are in one tree, so check the other open branches before picking a number.
- An additive migration ships before the code that needs it. A subtractive one ships after the code that stops needing what it removes.
- A migration that creates a table decides its `anon` and `authenticated` grants in the same file, and `supabase/tests/permissions_test.sql` gets an assertion for it.
- Nothing is applied to the hosted project from a Claude session. The push comes from a terminal.

`docs/PHASE_1_DEPLOYMENT.md` and `docs/PHASE_3_DEPLOYMENT.md` are dated records of the two deployments that taught most of this.

## Layout

```
CLAUDE.md                     product rules, vocabulary, voice rules, design system, engineering rules
docs/PRODUCT_CONTRACT.md      current product scope, categories, terminology, compatibility
docs/EXPANSION_PLAN.md        five expansion phases and audit gates
docs/DECISIONS.md             product decisions, settled and open, and the defaults in code
docs/REMEDIATION_PLAN.md      the eight phases from prototype to safe with real money, and where each stands
docs/SYSTEM_INVARIANTS.md     the rules the system has to keep, and which ones it does not keep yet
docs/REFUNDS_AND_DISPUTES.md  the refund policy and what enforces each part of it
docs/WIDGET_INSTALL.md        the one-line install, for a musician's own site
docs/ROADMAP.md               the original music build, phases 0 to 7
docs/mockups/                 seven HTML mockups: page structure and copy. The look lives in src/app/globals.css.

supabase/migrations/          the schema, numbered, append only
supabase/seed.sql             Gutter Hymns and Rosie
supabase/tests/               pgTAP suites and the two-session concurrency script
scripts/db-test.sh            the database gate CI runs

src/app/                      routes. [slug] is a musician, [slug]/[run] is a fundraiser
src/app/embed/[slug]/         the widget, the only page any origin may frame
src/app/api/                  checkout, the Stripe webhook, the three cron routes
src/app/actions/              server actions, one file per area
src/components/               shared components, listed in CLAUDE.md
src/lib/catalog.ts            sponsorship options and their suggested prices
src/lib/money.ts              cents, the fee, weekly payout slices
src/lib/boards.ts             fundraiser reads, with the in-memory fallback
src/lib/auctions.ts           the Node side of auctions: inputs, cards, mail. Postgres decides.
src/lib/outbox.ts             the refund queue
src/lib/weekly.ts             the mail that goes out on a schedule
src/lib/supabase/             server and browser clients. The service-role key stays in server.ts.
src/proxy.ts                  session refresh (middleware.ts, under its Next 16 name)
tests/                        unit tests on node --test, no test dependency
```

## Working with Claude Code

`CLAUDE.md` is the brief, and `AGENTS.md` says why to read the bundled Next.js docs before writing any: this is Next 16, and it differs from what a model remembers.

One change, one branch, one pull request. CI has to be green, and the merge is the owner's to run. More than one session may be working in this checkout at once, so look at `git status`, the open branches and the highest migration number before starting.
