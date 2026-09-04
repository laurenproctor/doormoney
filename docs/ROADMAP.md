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
- [ ] Stripe account in test mode, Connect enabled (Express accounts)
- [x] Deployed to Vercel from `main`
- [x] Resend (or equivalent) account for transactional email

**Done when:** `npm run dev` shows the home page with the sample board pulled from Supabase, and a push to `main` deploys.

---

## Phase 1. Marketing site and waitlist

**Goal:** the seven mockup pages, live on a real domain, collecting real names.

- [x] Shared layout: nav, footer, wordmark, tape label, stamp, button
- [x] Home page ported as the reference implementation
- [x] Placements page ported (`docs/mockups/placements.html` is the spec)
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
- [ ] Stripe Connect onboarding: Express account, hosted onboarding flow, webhook to mark the act as payable. Built in `src/app/actions/payouts.ts` and the `account.updated` webhook branch; untested until a Stripe key is in `.env.local`.
- [x] Runs: a tour, a season, or a residency month, with start and end dates and a show count
- [x] Lots: pick surfaces from the standard card, set a price, choose fixed or auction. Standard-card prices prefilled, editable. Up to six spots per surface; sold spots are never touched.
- [x] Act dashboard: current run, lots, what's sold, what's pending
- [x] Public board at `/board/[slug]`, matching the sample board mockups. Draft runs stay private; publishing from the run page makes the board public.
- [~] Approval flow: the act's side is on the dashboard (approve or decline a submitted mark). The patron's upload arrives with checkout in Phase 3.

**Done when:** a real act can go from signup to a live board without anyone at Door Money touching it.

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

- [ ] Bids table with a reserve and a close time per lot
- [ ] Live updates on the board via Supabase Realtime
- [ ] Proxy bidding or straight bidding: decide, then build one
- [ ] Close job: at close time, mark the winner, start the 48-hour clock
- [ ] Funding flow: winner gets an email and a checkout link; unpaid after 48 hours rolls to the next bid
- [ ] Anonymous bidding option, shown as "Anonymous patron"
- [ ] Outbid and closing-soon emails

**Done when:** two test patrons bid against each other, one wins, doesn't pay, and the lot rolls to the other automatically.

---

## Phase 6. Run tracking

**Goal:** enough evidence that the run happened to keep patrons confident, without the nightly-photo burden the copy no longer promises.

- [x] Show list per run: the act enters dates and venues once. On the run page in the dashboard.
- [x] "Played" toggle per show on the act dashboard, one tap
- [x] Optional photo per show, stored in Supabase Storage (public `shows` bucket). Shown on the end-of-run record once Phase 3 builds it.
- [ ] Patron flag: "I don't think this ran." Pauses the next release for that lot until Door Money looks.
- [x] Attendance field per show, self-reported, optional

**Done when:** the end-of-run record can show a real photo from a real show, and a flagged lot pauses correctly.

---

## Phase 7. Launch New York

**Goal:** the first fifty acts and the first fifty patrons, by hand.

- [~] Admin views at `/admin`: acts, runs, lots, payments, contact notes, waitlist. Read-only, gated by `ADMIN_EMAILS`. Flags arrive with Phase 6's patron flag; actions later.
- [ ] Founding-act badge and free-forever listing for the first fifty
- [ ] Terms of service and privacy policy, reviewed by a lawyer
- [ ] Stripe review of the platform model, done before real money moves at scale
- [ ] Manual outreach list: residencies, corner bars, neighborhood businesses
- [ ] Weekly digest email, once there are real numbers in it

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
