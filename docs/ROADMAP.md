# Door Money roadmap

From seven mockup pages to a working marketplace in New York. Phases are ordered so that each one ships something usable on its own, and so that money-handling is built once and reused by the board, the widget and the auctions rather than three times.

Time estimates assume one person working with Claude Code, most days. Treat them as sequencing, not deadlines.

---

## Phase 0. Foundations

**Goal:** a repo that builds, deploys, and talks to a database. Nothing user-facing yet.

- [x] Next.js 16 app, Tailwind 4, TypeScript, `src/` layout
- [x] Design tokens ported from the mockups (paper, black, red, tape, three typefaces)
- [x] `CLAUDE.md` encoding the product rules and the voice rules
- [x] Data model designed and written as a Supabase migration
- [x] Seed data: Gutter Hymns and Rosie, so every screen has something to render
- [x] Supabase project created, migration applied, `.env.local` filled in
- [x] Stripe account in test mode, Connect enabled (Express accounts). Proven 2026-09-03 with a throwaway act: hosted Express onboarding, `account.updated`, a transfer against a charge.
- [x] Deployed to Vercel from `main`
- [x] Resend (or equivalent) account for transactional email

**Done when:** `npm run dev` shows the home page with the sample board pulled from Supabase, and a push to `main` deploys.

---

## Phase 1. Marketing site and waitlist

**Goal:** the seven mockup pages, live on a real domain, collecting real names.

- [x] Shared layout: nav, footer, wordmark, tape label, stamp, button
- [x] Home page ported as the reference implementation
- [x] How sponsorship works page ported at `/how-sponsorship-works` (`docs/mockups/placements.html` was the spec; the page was reworked and the `/placements` route removed)
- [x] Live auctions index ported
- [x] List an act page ported
- [x] Widget marketing page ported
- [x] Two sample board pages ported, reading from seed data rather than hardcoded lots
- [x] Waitlist table and API route; the form on Home and List an act writes to it
- [x] Waitlist confirmation email (sends once Resend and a sender address are in `.env.local`)
- [ ] Domain pointed at Vercel
- [x] Analytics: Vercel Web Analytics, cookieless, off on the embed (`src/components/Analytics.tsx`). Switch it on in the Vercel project's Analytics tab.

**Done when:** every page from the mockups exists at a real URL, and the waitlist form saves to the database.

**Tagline:** settled. See `docs/DECISIONS.md`, decision 1.

---

## Phase 2. Acts and boards

**Goal:** a musician can sign up, describe a run, price their surfaces, and get a public board page.

- [x] Auth: Supabase Auth with magic-link email. No passwords. Sign-in at `/login`, callback at `/auth/callback`, session refresh in `src/proxy.ts`. Auth emails go out through Resend SMTP.
- [x] Act onboarding: name, slug, city, type (touring band, house act, soloist), photo. One act per account. Photos land in the public `acts` bucket.
- [x] Stripe Connect onboarding: Express account, hosted onboarding flow, webhook to mark the act as payable. `src/app/actions/payouts.ts` and the `account.updated` webhook branch. Tested end to end 2026-09-03 in test mode.
- [x] Runs: a tour, a season, or a residency month, with start and end dates and a show count
- [x] Lots: pick surfaces from the standard card, set a price, choose fixed or auction. Standard-card prices prefilled, editable. Up to six spots per surface; sold spots are never touched.
- [x] Act dashboard: current run, lots, what's sold, what's pending
- [x] Public board at `/[slug]/support-[run]`, with the act's own page at `/[slug]`, matching the sample board mockups. Draft runs stay private; publishing from the run page makes the board public.
- [x] Approval flow: the patron sends the mark at `/mark/<purchase id>`, the act approves or declines it on the dashboard, and both sides are emailed. A no refunds in full and puts the spot back on the board.
- [x] Placement verification: the musician picks, per run, what patrons get back from a fixed list (dated photos from selected shows, a venue and date list, attendance estimates, post links, a short video, the end-of-run record, or a write-in). `VerificationEditor` on the run page, `PlacementVerification` on the board under the placements, migration 0020. Publishing needs at least one. See `docs/DECISIONS.md`, decision 9.
- [x] Self-service publishing: a readiness checklist on the run page (profile, run, placements, verification, payouts, ready), one set of rules shared with `publishRun`, and a private draft preview at `/dashboard/runs/[id]/preview` that renders the real board component. Payout setup shows as incomplete and never blocks: Door Money holds the money either way.
- [x] The musician's own website and Instagram on the board, under the bio, sanitised server-side in `src/lib/links.ts`.
- [x] One account for both sides: `profiles.roles` holds musician, patron, or both (migration 0021). Sign-up asks in plain words and takes both. Sign-up and sign-in lost the nav and footer and gained a reason column: benefits on the left, the form on the right. The board address moved off sign-up and onto the act page, where it means something.
- [x] The patron's side at `/patron`: placements taken, runs backed, bids and how each one ended, and a link to the record behind every placement. An address that paid before it had an account picks its history up at sign-up.
- [x] The public patron profile at `/patron/[username]`: optional, private until published, and per-activity. See Phase 2b below and `docs/DECISIONS.md`, decision 11.

**Done when:** a real act can go from signup to a live board without anyone at Door Money touching it.

The whole path works without Door Money touching a page, 2026-09-04: sign in, act, run, spots, verification, preview, publish.

---

## Phase 2b. The public patron profile

**Goal:** a patron can say who they are and name some of what they have put behind musicians, without a single number being visible and without anything being visible by accident.

Private by default, twice over: the page is unpublished until the patron publishes it, and each placement and backing is off until it is put on, one at a time. See `docs/DECISIONS.md`, decisions 11 and 12.

- [x] `patron_profiles`, `patron_profile_items` and `username_history` (migration 0024), with RLS, an immutable check on the music preferences, and two sanitised public views. `profiles` is never opened to the browser: it holds email addresses.
- [x] The public page at `/patron/[username]`: photograph or initials, name, `@username`, region, bio, "Patron since", one optional https link, up to eight music preferences, the published activity and the totals counted from it. No amounts, anywhere.
- [x] The management page at `/dashboard/profile`, reachable by an account that owns no act. Publish and hide, the details, a control per placement and per backing, and the username with the date it may next move.
- [x] `/patron/signup`: the same account and the same auth as `/signup`, without asking a patron to pick a board address. Lands on the profile page.
- [x] An optional invitation on the end-of-run record, after the record itself. Nothing on a payment path.
- [x] Usernames move once every twelve months, in one transaction with the act's board address, with retired words kept for good and old URLs redirecting permanently (`claim_username`, migration 0024).
- [x] Patron rows link to accounts on the verified auth address only, never on a typed one: at sign-up, on the profile page, and at the moment a signed-in patron pays under their own address.
- [x] Profile photographs in a private Storage bucket, reached through short-lived signed links, so hiding a profile hides the photograph too.
- [ ] One email-preference system covering musicians and patrons. Deferred deliberately: notification settings are not public profile fields, and Door Money needs one place for both sides rather than a patron-only toggle now and a musician one later. Nothing about it is in the interface yet, because a dead toggle is worse than no toggle.

**Done when:** a patron with no act can open an account, publish a page, put one placement on it and leave the rest off, and a musician who renames their board keeps every old link working.

---

## Phase 2c. The words

**Goal:** the whole site speaks the vocabulary decision 14 settled, rather than one page speaking it and the rest carrying what came before.

Decision 14 replaced the insider words with the ones a stranger would use: a **fundraiser** is what a musician opens, a **sponsorship** is the exchange, a **placement** is only where a sponsor appears, a **logo** is what goes there. `/how-sponsorship-works` was written that way and nothing else was, so the site currently says both. Addresses do not move with the words: routes and columns keep their names, and `runs`, `lots`, `acts` and `/mark/<id>` all stay.

The rule is convert a page when you touch it, never a repo-wide replace. This list exists so that what is left is countable rather than remembered.

- [x] `/how-sponsorship-works`, converted when it was renamed from `/placements`
- [x] The fundraiser index at `/auctions`. It was converted with the nav and the list above had it wrong; two labels were left, "placements open" and "shows on the run", and both are gone now
- [x] Home: the hero, the steps, the fundraiser section, the house rules and the two calls to action
- [x] A musician's page at `/[slug]` and a fundraiser's page at `/[slug]/[run]`, including `BoardView`, `BoardLots`, `BidForm`, the sample backers and `PlacementVerification`. The period is named from `runs.kind` through `src/lib/periods.ts` rather than branching on "season or run" in nine places
- [x] The dashboard: the fundraiser pages, the readiness checklist, the payout pages and the server-action messages a musician reads when something goes wrong. The nav says Musician rather than "the act", which the vocabulary bans in prose
- [x] `/mark/<id>` and its form. Not on this list originally, and it had to come with the emails: they now say "send the logo" and link straight to it
- [x] The patron pages: `/patron`, `/patron/[username]`, `/dashboard/profile`, `/patron/signup` and `ProfileForms`. The public profile calls a bought spot a Sponsorship rather than a Placement, and the impact line counts fundraisers backed
- [x] Emails in `src/lib/email.ts`, the record at `/record/[id]` and the flag page under it. Mail already sent keeps the words it was sent with; only new mail changes. Emails carry a fundraiser's title but not its kind, so they say "the fundraiser" where a page would name the tour or the season
- [x] The widget itself (`/embed/[slug]`, `EmbedClient`, `WidgetFrame`). Missed when this list was written: it is neither the `/widget` marketing page nor a page of the site, but it is the surface a fan reads before paying. It takes `runs.kind` now, so it names the tour or the season above the card field
- [ ] The legal pages, which name placements and boards throughout
- [x] `/list` and `/widget`, the two pages that speak only to musicians. Both kept their second person, which voice rule 1 allows a single-audience page
- [ ] Retire the last of "board" from copy, and check `Logo.tsx` was left alone: "mark" there means the wordmark

**Done when:** a reader who lands on any two pages is told the same thing in the same words, and `grep -i board src/app --include=*.tsx` finds only routes, table names and the wordmark.

**Not in scope:** renaming anything with an address. `/board/<slug>` stays a permanent redirect, `runs` stays the table, and no migration is needed for any of this.

---

## Phase 3. Money, fixed price only

**Goal:** a patron pays, Door Money holds it, the act gets paid weekly. Auctions wait.

This is the phase that decides whether the business works, so it comes before auctions and before the widget. Both of those reuse everything built here.

- [x] Checkout for a fixed-price lot: embedded Checkout Session on the board itself (`LotCheckout`, `/api/checkout`). Stripe's form, Door Money's page.
- [x] Charge model: platform charge with delayed transfers to the act's connected account (separate charges and transfers, `source_transaction` on each). Door Money holds the balance.
- [x] Weekly payout job: Vercel Cron hits `/api/cron/payouts` every Friday 14:00 UTC (`vercel.json`, bearer `CRON_SECRET`); `src/lib/payouts.ts` moves every due slice and emails the act. Idempotent, safe to run by hand.
- [x] Release rule: what counts as "the run happening." See `docs/DECISIONS.md`, decision 2. The default in this codebase is calendar-based: funds release in equal weekly slices across the run's dates, with an act-side "cancel run" that refunds the remainder.
- [x] Refunds: the act can cancel an open or live run from the dashboard; every patron gets back the unreleased slices, fee included (`src/lib/refunds.ts`). A declined mark refunds in full and puts the spot back on the board. Refunds made in the Stripe Dashboard are mirrored by the `charge.refunded` webhook.
- [x] Receipts: payment confirmation to the patron and a sale notice to the act at purchase; a payout notice to the act each Friday something moves
- [x] End-of-run record at `/record/[purchaseId]`: the shows, the rooms, attendance where counted, and the week-by-week money. Linked from the receipt; emailed again when the Friday job closes the run.
- [x] Stripe webhooks, idempotent: checkout completed / async succeeded / async failed / expired, charge.refunded, transfer.created, account.updated. Disputes are still manual.
- [x] Door Money's 15% kept by transfer math: the schedule is built from amount minus `fee_cents`, so the fee is what never leaves the platform balance. (Stripe has no application fee on transfers; `application_fee_amount` belongs to destination and direct charges, which this is not.)

**Done when:** a test-mode patron backs a test-mode act, the money sits in the platform balance, and the Friday job moves it. Then run it with one real act and one real patron, for real money, before building anything else.

The test-mode half is done, 2026-09-03. A throwaway act finished Express onboarding, a patron took a $200 spot and a fan backed $100 through the widget, and the Friday job sent ten transfers totalling $159.35, each with `source_transaction` on the right charge. Running it twice moved nothing the second time. Door Money's $45 stayed on the platform balance. The rehearsal data was deleted and both charges refunded afterwards. What remains is the same thing with real money.

---

## Phase 4. The widget

**Goal:** one line of code on an artist's site, taking payment inline.

- [x] `/embed/[slug]`: the widget page, designed to live in an iframe. No nav, no footer, tight layout. The board itself frames it too, in the "Fans" section.
- [x] `/embed.js`: the loader. Injects the iframe, listens for a resize message, nothing else.
- [x] Payment Element inside the iframe. A backing is a PaymentIntent confirmed in the frame (Checkout cannot be nested in another site's iframe); the charge lands on the platform balance and the webhook (`payment_intent.succeeded`) fulfils it through `src/lib/backings.ts`. Same Friday schedule, same refunds, same record as a lot purchase.
- [x] Fan tiers on the widget (see decision 3): $25 and $100 with recognition, and a "take a placement" option that opens the board in a new tab. `backings` table (migration 0010 adds the charge and refund columns and the public `run_backers` view).
- [x] Content Security Policy headers on `/embed/*` so the widget can be framed anywhere, and on everything else so it can't be
- [x] Link button and "Backed on Door Money" badge as downloadable assets for link-only platforms: `/badge/dark.svg`, `/badge/light.svg`, `/badge/button.svg?act=<name>`
- [x] Widget snippet and assets shown on the act dashboard the moment the board is live
- [~] Test on Squarespace, WordPress, Wix, Webflow and Carrd. Document any platform-specific quirks. Verified on a hand-built site on another origin (frame, resize, origin recorded, transparent on a light page); the builder platforms are still to try on throwaway accounts. Notes and expected quirks in `docs/WIDGET_INSTALL.md`.

**Done when:** the snippet works on a throwaway Squarespace site and a payment from it lands in the platform balance.

---

## Phase 5. Auctions

**Goal:** the live board with bidding, closing times, and the 48-hour funding window.

- [x] Bids table with a reserve and a close time per lot. The reserve is the lot's `price_cents`; migration 0011 adds `lots.closes_at`, which falls back to the run's `bidding_closes_at`.
- [x] Live updates on the board via Supabase Realtime. `BoardLots` watches the `bids` table and re-reads the board, so names and totals stay server-rendered.
- [x] Straight bidding, per `docs/DECISIONS.md`, decision 4. The next bid is the top bid plus `bidStepCents`, or the reserve when there are none. A bid ten times the asking price asks for confirmation first.
- [x] Close job: `/api/cron/daily` (`src/lib/auctions.ts`), once a day in `vercel.json`, with boards settling their own overdue lots on sight. The top bid at or above the reserve wins and gets 48 hours; nothing at the reserve goes unsold and the act is told.
- [x] Funding flow: the winner gets an email with a private link at `/claim/[token]`, and pays through the Phase 3 checkout at the bid amount. Unpaid after 48 hours, the bid is marked passed and the lot rolls to the next bid with a fresh window and a fresh link. The old link dies.
- [x] Anonymous bidding option, shown as "Anonymous patron", on the board and after the sale. The act sees the name.
- [x] Outbid and closing-soon emails, one per bid and one per lot.
- [x] Take it now, added on request outside the original plan: an auction spot can carry a set price that ends the bidding. Migration 0012 adds `lots.buy_now_cents`, above the reserve by constraint, and the act sets it beside the reserve on the run page. The offer stands while the bidding is below it and disappears once a bid reaches it. Taking a spot charges immediately through the Phase 3 checkout, and everyone who bid is told the bidding is over and that nothing was charged to them.

**Done when:** two test patrons bid against each other, one wins, doesn't pay, and the lot rolls to the other automatically.

Done 2026-09-03, in test mode, on a throwaway board. Two patrons bid $120 and $150, a $110 bid was refused with the minimum, and a bid landing elsewhere reached an open board in about a second. The auction closed to the $180 top bid, the winner let the window lapse, and the job marked that bid passed and rolled the lot to $150 with a new link. The second bidder paid, the lot sold at the bid rather than the reserve, and four Friday slices were laid down. The rehearsal data was deleted and the charge refunded.

---

## Phase 6. Run tracking

**Goal:** enough evidence that the run happened to keep patrons confident, without the nightly-photo burden the copy no longer promises.

What a patron is promised is now the musician's own answer, taken per run in Phase 2 and shown on the board (`docs/DECISIONS.md`, decision 9). This phase is the machinery behind the answers: the show list, the played toggle, the photos and the headcounts that fill the end-of-run record. Neither side promises a photograph from every night, and neither says Door Money went and looked.

- [x] Show list per run: the act enters dates and venues once. On the run page in the dashboard.
- [x] "Played" toggle per show on the act dashboard, one tap
- [x] Optional photo per show, stored in Supabase Storage (public `shows` bucket). Shown on the end-of-run record once Phase 3 builds it.
- [x] Patron flag: "I don't think this ran." At `/record/[id]/flag`, reached from the record and from the receipt email, needing no account. Raising it pauses every slice not yet released on that placement or backing, mails Door Money and the patron, and tells nobody else: Door Money looks first. Slices already sent stay sent. `src/lib/flags.ts`, migration 0015.
- [x] Attendance field per show, self-reported, optional

**Done when:** the end-of-run record can show a real photo from a real show, and a flagged lot pauses correctly.

The flag half is done, 2026-09-03. A purchase with four Friday slices still to go was flagged from the patron page: all four moved to paused, the payout job then moved nothing and reported no errors, and both emails went out. Releasing the hold from the admin queue put all four back to scheduled, after which the job tried to pay and failed only on the deliberately fake charge id. The rehearsal data was deleted.

---

## Phase 7. Launch New York

**Goal:** the first acts and the first patrons, by hand.

- [~] Admin views at `/admin`: acts, runs, lots, payments, backings, contact notes, waitlist, and the flag queue, gated by `ADMIN_EMAILS`. Read-only apart from one action: releasing a patron's hold, which puts the paused slices back in the Friday queue. Refunding instead still goes through the act's cancel or the Stripe Dashboard.
- [ ] ~~Founding-act badge and free-forever listing for the first fifty~~ Dropped 2026-09-03: no cohort limits and no free claims anywhere on the site.
- [ ] Terms of service and privacy policy, reviewed by a lawyer
- [ ] Stripe review of the platform model, done before real money moves at scale
- [ ] Manual outreach list: residencies, corner bars, neighborhood businesses
- [x] Weekly digest email: the week in numbers to `ADMIN_EMAILS` (boards opened, spots sold, backings, money sent and held, open flags, new subscribers, notes). `src/lib/weekly.ts`.
- [x] The new-boards email actually sends. The list had a signup, a welcome and an unsubscribe since Phase 1 but nothing that posted the weekly note. Boards that have opened since the last one go out to the list, each board announced once (`runs.announced_at`), never more than weekly. The sample boards go out like any other, by Lauren's call.

**Done when:** ten acts have live boards and five have been paid.

---

## What is deliberately not on this list

- Native apps. The widget and a responsive site cover it.
- Chat between acts and patrons. Email is enough until it isn't.
- Multiple currencies. New York first.
- Video proof. Photos, optional, are plenty.
- A patron marketplace with search and filters. Fifty acts fit on one page.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router | Server components for the marketing pages, route handlers for webhooks, one deploy |
| Styling | Tailwind 4 with the mockup tokens | Fast to port the mockups, easy for Claude Code to extend |
| Database and auth | Supabase (Postgres, Auth, Realtime, Storage) | Auth and realtime out of the box; Neon would need both added separately |
| Payments | Stripe Connect, Express accounts, separate charges and transfers | The only model that lets a platform hold funds and pay out on a schedule while Stripe handles the act's KYC and tax forms |
| Email | Resend | Simple API, React templates |
| Hosting | Vercel | Cron, edge, previews per branch |
| Automation | n8n | Already in use; good home for the weekly digest and any glue |
