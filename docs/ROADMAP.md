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
- [ ] Deployed to Vercel from `main`
- [ ] Resend (or equivalent) account for transactional email

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
- [ ] Analytics (Plausible or Vercel Analytics)

**Done when:** every page from the mockups exists at a real URL, and the waitlist form saves to the database.

**Decision needed before starting:** the tagline. "Proof or it doesn't pay" is still on every page. See `docs/DECISIONS.md`.

---

## Phase 2. Acts and boards

**Goal:** a musician can sign up, describe a run, price their surfaces, and get a public board page.

- [ ] Auth: Supabase Auth with magic-link email. No passwords.
- [ ] Act onboarding: name, slug, city, type (touring band, house act, soloist), photo
- [ ] Stripe Connect onboarding: Express account, hosted onboarding flow, webhook to mark the act as payable
- [ ] Runs: a tour, a season, or a residency month, with start and end dates and a show count
- [ ] Lots: pick surfaces from the standard card, set a price, choose fixed or auction. Standard-card prices prefilled, editable.
- [ ] Act dashboard: current run, lots, what's sold, what's pending
- [ ] Public board at `/board/[slug]`, matching the sample board mockups
- [ ] Approval flow: a patron's mark is uploaded, the act approves or declines, nothing publishes until approved

**Done when:** a real act can go from signup to a live board without anyone at Door Money touching it.

---

## Phase 3. Money, fixed price only

**Goal:** a patron pays, Door Money holds it, the act gets paid weekly. Auctions wait.

This is the phase that decides whether the business works, so it comes before auctions and before the widget. Both of those reuse everything built here.

- [ ] Checkout for a fixed-price lot: Stripe Payment Element, on Door Money's own domain
- [ ] Charge model: platform charge with a delayed transfer to the act's connected account (separate charges and transfers). Door Money holds the balance.
- [ ] Weekly payout job: every Friday, transfer each act's released amount to their Connect account. Vercel Cron or n8n, either is fine.
- [ ] Release rule: what counts as "the run happening." See `docs/DECISIONS.md`, decision 2. The default in this codebase is calendar-based: funds release in equal weekly slices across the run's dates, with an act-side "cancel run" that refunds the remainder.
- [ ] Refunds: full refund if the act cancels before the first show; prorated if cancelled mid-run
- [ ] Receipts: payment confirmation to the patron, payout notice to the act
- [ ] End-of-run record: the page the patron sees when the run closes. Shows played, rooms, attendance where known.
- [ ] Stripe webhooks for every state change, idempotent
- [ ] Door Money's 15% taken as an application fee on the transfer, not on the charge

**Done when:** a test-mode patron backs a test-mode act, the money sits in the platform balance, and the Friday job moves it. Then run it with one real act and one real patron, for real money, before building anything else.

---

## Phase 4. The widget

**Goal:** one line of code on an artist's site, taking payment inline.

- [ ] `/embed/[slug]`: the widget page, designed to live in an iframe. No nav, no footer, tight layout.
- [ ] `/embed.js`: the loader. Injects the iframe, listens for a resize message, nothing else.
- [ ] Payment Element inside the iframe, same checkout code as Phase 3
- [ ] Fan tiers on the widget (see decision 3): $25 and $100 with recognition, and a "take a placement" option that opens the board in a new tab
- [ ] Content Security Policy headers on `/embed/*` so the widget can be framed anywhere, and on everything else so it can't be
- [ ] Link button and "Backed on Door Money" badge as downloadable assets for link-only platforms
- [ ] Widget snippet and assets shown on the act dashboard the moment the board is live
- [ ] Test on Squarespace, WordPress, Wix, Webflow and Carrd. Document any platform-specific quirks.

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

- [ ] Show list per run: the act enters dates and venues once
- [ ] "Played" toggle per show on the act dashboard, one tap
- [ ] Optional photo per show, stored in Supabase Storage, shown on the end-of-run record
- [ ] Patron flag: "I don't think this ran." Pauses the next release for that lot until Door Money looks.
- [ ] Attendance field per show, self-reported, optional

**Done when:** the end-of-run record can show a real photo from a real show, and a flagged lot pauses correctly.

---

## Phase 7. Launch New York

**Goal:** the first fifty acts and the first fifty patrons, by hand.

- [ ] Admin views: acts, runs, lots, payments, flags. Read-only first, actions later.
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
