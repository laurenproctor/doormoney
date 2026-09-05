# Door Money

Sponsorship marketplace for working musicians in New York. Local businesses and gear brands put money behind bands, house acts and soloists: a name on the kick drum, the road cases, the tip jar, a post. Door Money holds the money and pays the musician every Friday through the fundraiser. Fans can also back a musician through an embeddable widget.

Read `docs/ROADMAP.md` for the phases and `docs/DECISIONS.md` for the open product questions and the defaults this codebase assumes. The seven HTML files in `docs/mockups/` hold the page structure and the copy. The look is the design system below, not the mockups' paper palette.

@AGENTS.md

## Vocabulary

Two kinds of word live here, and they are governed differently. Settled in `docs/DECISIONS.md`, decision 14.

**Identity words carry the company and do not change.** Musician, patron, backing, Door Money, "put money behind the music". The idea behind all of it: Door Money is a patronage market for working musicians. Sponsorship is the mechanism, not the point.

**Mechanism words are labels for how the machine works.** They should be whatever a stranger would say. Where a plain word exists, the plain word wins, even when the insider word is more precise.

- **Musician**: the supply side. Subtypes when the type matters: band, soloist, ensemble, house act. Never "artist" in product copy, never "creator", never "user". "Act" survives in the data model (`acts` table) and in the flow name "List an act"; in prose say musician or band, never "the act".
- **Patron**: the umbrella for anyone on the paying side, at any stage, fan or business. Their account at `/patron`, their page at `/patron/<username>`, the musicians they have backed. One account can be a musician and a patron at once (`profiles.roles`, decision 10), so never write copy that assumes an account is only one of them. Never "advertiser", never "buyer", never "customer", never "supporter" as a noun.
- **Sponsor**: a patron whose money buys a sponsorship, which in practice is a business or a brand taking a placement. Use it wherever the subject is that transaction: the sponsorship pages, the sponsorship options, the approval flow.
- **Backer**: a patron whose money is a backing, the fan tier through the widget. A backing is not a sponsorship, so a fan was never a sponsor. The test: name the transaction and the noun follows, and if nothing in the sentence is a sponsorship the person is a patron.
- **Fundraiser**: what a musician opens to fund one tour, residency or season. Never "board", never "campaign", never "run" in copy. Name the actual period where it is known. `runs` stays the table and `support-<slug>` stays the address.
- **Sponsorship**: the exchange itself. **Sponsorship option** is one thing a musician offers, at a price the musician sets.
- **Placement**: only the place a sponsor appears (a kick drum head, a merch table runner, a newsletter). Never the thing being bought; that is a sponsorship. "Lot" is the database word and stays there. Never "surface" in copy, and never "standard card": the figures in `src/lib/catalog.ts` are **suggested prices**.
- **Logo**: the sponsor's name or logo as it will appear. Never "the mark" in copy, never "ad", never "creative". `mark_text`, `mark_status` and `/mark/<id>` keep their names, because that route is in receipts already sent.
- **Backing**: a fan-tier contribution through the widget, made by a backer. Not a sponsorship.
- **Record**: the end-of-fundraiser summary a sponsor receives. Never "receipt" in copy (fine in code for Stripe receipts), never "report".
- **Profile**: a patron's optional public page at `/patron/<username>`, managed at `/dashboard/profile`. Private until published, and per activity after that (decision 11). Never "supporter page", never "fan page", never "leaderboard". The list of what a patron listens for is **music preferences** in the dashboard and "Listening for" on the page; never "tags", never "genres", since a preference can be a scene, an instrument or a tradition.

The company is not "an advertising marketplace" or "an influencer platform". The differentiator is that musicians get paid for the work of being musicians without becoming influencers.

Addresses outlive words: routes and columns keep their names even where the copy changes. `/placements` becoming `/how-sponsorship-works` was the one exception, done while nothing was public.

The site is written in this vocabulary, apart from the four legal pages, which wait for the Phase 7 lawyer review. `tests/vocabulary.test.ts` holds the line: it sweeps the app for the retired words and fails with the file, the line and the sentence. Convert a page when you touch it, and never run a repo-wide replace, least of all on `src/components/Logo.tsx`, where "mark" means the wordmark and nothing else. When that test fails it is usually right; the fix is the word, not the test.

## Voice rules for anything user-facing

These are firm. They apply to page copy, button labels, emails, error messages, empty states and placeholder text.

1. **The second person only where "you" can mean one person.** The site serves musicians and the people funding them, usually on the same page, so editorial copy stays in the third person and names the side it means: "Musicians set their own prices," not "you set your prices." That covers home, how sponsorship works, the fundraiser index, an act's page, a fundraiser's page and the legal pages. Transactional surfaces go the other way: sign up, sign in, the password flows, the dashboard, the patron pages behind an account, form labels, helper text, validation messages, the record and any email about somebody's own money are written to the person doing the thing, in the second person. A marketing page with only one audience (List an act, the widget) may use either, and both use the second person today. Button labels are imperative or nominal everywhere: "List an act", "Back a musician", "Create free account". Settled in `docs/DECISIONS.md`, decision 15.
2. **Active voice.** Name who does what. "Door Money holds the money," not "the money is held." "Patrons put the money up," not "the money is put up."
3. **Benefits before mechanics.** Lead with what sponsorship does for the musician (gas, rooms, the difference between a tour that happens and one that doesn't) and what a sponsor gets (attention, a name in the room, support they can point at). Mechanics (holds, weekly payouts, approvals) come second and stay short.
4. **Plain words.** No insider phrasing, no jargon, no cleverness that needs decoding. "When Door Money opens," not "when doors open." "Attendance," not "through the door."
5. **No em dashes.** Anywhere. Use a comma, a colon, a period, or parentheses.
6. **No invented proof.** A fundraiser says what its musician actually ticked, and nothing more. The verification methods live in `src/lib/verification.ts` and reach the page through `PlacementVerification`; never write proof language by hand into a page. Don't promise documentation from every show: the methods say "selected shows" because that is the promise. Don't imply Door Money inspected anything, so no "verified by Door Money", no "confirmed", no certification language. Documentation comes from the musician and Door Money passes it on. Keep the commitment the size it is (see `docs/DECISIONS.md`, decision 9).
7. **Short sentences.** Cut the second clause when the first one already lands.

## Design system

Tokens live in `src/app/globals.css`. Use them; don't introduce new colors or fonts.

Every page is a dark room with one color of light in it. The room is the same on every page; the light changes per page. Three stage lights (`StageLights`, mounted by `Theme`) throw the accent down the room from a truss above the page and swing as the reader scrolls; they hold still under reduced motion.

- The room: `ground` (page background), `ink` `#F4F0E8` (text), `muted` (secondary text), `line` (1px rules and borders), `panel` (a lifted, translucent block).
- The light: `accent` (fills, glows, rules, display type at 24px and up), `accent-ink` (the tint of the accent that clears 4.5:1 on the ground; use it for any accent text under 24px), `on-accent` (text on an accent fill).
- Themes, set with `<Theme name>` or the `theme` prop on `Page`: blue (home, sign in, sign up, dashboard, the embed), lime (how sponsorship works), magenta (live auctions), amber (list an act), teal (widget), violet (contact), red (404), mono (the legal pages). A musician's pages take a color by slug through `themeFor`, so each act keeps the same light.
- Smallest text on the site is 14px. Metadata and captions use 14 or 14.5px, body copy 15px and up.
- Bodoni Moda for H1s only, set in caps (the `display` utility; the accent word in a headline is italic). Archivo for everything else: headings below the H1 (the `heading` utility, medium weight), body, and tracked caps labels (the `caps` utility). Nothing else.
- Thin 1px lines (`edge`), no hard shadows, no tilt, no rounded corners except circles. Blocks that should catch the light use `glow` or `lit`. Heroes carry a stage light (`HeroArt`); a photo dropped at `public/hero/<theme>.jpg` appears under it, or pass `photo` to name the file (the home page uses `hero/saxophone.jpg`). The other themes carry public domain Gottlieb club photographs; credits in `public/hero/CREDITS.md`.
- Components in `src/components/`: `Logo` (the mark and wordmark, inline SVG in the current text color), `Theme`, `StageLights`, `Reveal` (blocks marked `data-reveal` rise in on scroll; `--i` staggers siblings; heroes use the `hero-in` class), `Nav`, `Footer`, `Page`, `HeroArt`, `Eyebrow`, `Stamp`, `Button`, `Section`, `SectionHead`, `Steps`, `Lines`, `NewsletterCTA` and `NewsletterStrip` (the new-fundraisers email: the band on patron pages, the strip in the footer), `PlacementVerification` (what a fundraiser promises sponsors, on its page), `VerificationEditor` and `ReadinessChecklist` (the dashboard sides of the same thing), `AuthShell` and `AuthPoints` (sign up and sign in, which carry no nav and no footer), `ProfileForms` (the four forms behind a patron's public profile). Reuse them.

## Engineering rules

- Next.js 16 App Router. `params` and `searchParams` are Promises: await them. `middleware.ts` is now `proxy.ts`.
- Server components by default. Add `"use client"` only for interactivity.
- Supabase for Postgres, Auth, Realtime and Storage. Server-side client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`. Never use the service-role key in client code.
- Stripe Connect with Express accounts, separate charges and transfers. The patron pays Door Money through an embedded Checkout Session; the charge sits on the platform balance and weekly Transfers (with `source_transaction`) move the act's share out. Door Money's 15% is the part never transferred: the schedule is built from amount minus `fee_cents`. Never `application_fee_amount`, never `transfer_data` on the charge. Every Stripe webhook handler must be idempotent: check `stripe_events` before acting, and make each write conditional on the state it expects.
- Money is stored as integer cents in Postgres, never floats. Format with `formatMoney` from `src/lib/money.ts`.
- The widget at `/embed/[slug]` must be frameable by any origin; nothing else may be. See `next.config.ts` headers.
- The sponsorship options and their suggested prices live in `src/lib/catalog.ts`. Prices there are defaults; the musician's own price on a lot always wins.
- Validate every API input with zod. Return typed errors, never raw exceptions.
- Public reads of anything a patron owns go through a sanitised view (`public_patron_profiles`, `public_patron_activity`, `lot_buyers`, `run_backers`), granted to `anon` and selecting only public columns. Never open `profiles`, `purchases`, `backings`, `bids` or `patrons` to the browser: they hold email addresses, amounts and Stripe ids. Selecting a private column and hiding it in React is not privacy.
- A patron's public profile and each item on it are off by default, in the database, and are turned on one at a time. An anonymous bid is never publishable, whatever a form says.
- A new table is outside the Data API boundary until its grants are revoked. Row level security with no policy still answers PostgREST `200 []` rather than refusing, so the migration that creates a table decides its `anon` and `authenticated` grants in the same file, and `supabase/tests/permissions_test.sql` gets an assertion for it. Migration 0022 was a snapshot; 0029 had to catch up eight tables it never covered.
- Usernames are claimed and changed through `claim_username` (migration 0024) and nowhere else. It holds the whole namespace (`profiles.username` and `acts.slug`), the twelve-month rule, the retired-word list, and the atomic move of a musician's own address. `RESERVED_SLUGS` in `src/lib/slug.ts` still has to grow whenever a top-level route does.
- Patron profile photos live in the private `patron-photos` bucket and are only ever reached through a short-lived signed URL minted on the server. Act and show photos stay in their public buckets.
- Prefer server actions for form posts from our own pages; route handlers for webhooks and for anything the widget calls cross-origin.

## Working with the mockups

`docs/mockups/*.html` are self-contained pages with inline CSS in the old paper look. They are the source for sections, order and copy, not for color or type. When porting one:

1. Read the whole file first.
2. Reuse the shared components rather than copying the nav and footer. Take the layout and the words from the mockup; take the look from the design system above.
3. Keep the copy word for word unless it breaks a voice rule above or uses retired vocabulary, in which case fix it and note it in the commit.
4. Replace hardcoded sample data with reads from Supabase, using the seed data so the result looks the same.
5. Match the layout at desktop and at 380px wide.

## Do not

- Add a light mode. The dark room and the colored light are the brand.
- Add analytics scripts, chat widgets or third-party embeds to the marketing pages without asking.
- Store card numbers, ever. Stripe Elements only.
- Write "you" on a page that talks to musicians and the people funding them at once. The second person belongs on the pages somebody uses, not the pages that describe the market. See voice rule 1.
