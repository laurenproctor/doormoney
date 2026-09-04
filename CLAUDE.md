# Door Money

Sponsorship marketplace for working musicians in New York. Local businesses and gear brands put money behind bands, house acts and soloists: a name on the kick drum, the road cases, the tip jar, a post. Door Money holds the money and pays the act weekly through the run. Fans can also back an act through an embeddable widget.

Read `docs/ROADMAP.md` for the phases and `docs/DECISIONS.md` for the open product questions and the defaults this codebase assumes. The seven HTML files in `docs/mockups/` hold the page structure and the copy. The look is the design system below, not the mockups' paper palette.

@AGENTS.md

## Vocabulary

Use these words and only these words for these things. The idea behind all of it: Door Money is a patronage market for working musicians. Placements are the mechanism, not the point.

- **Musician**: the supply side. Subtypes when the type matters: band, soloist, ensemble, house act. Never "artist" in product copy, never "creator", never "user". "Act" survives in the data model (`acts` table) and in the flow name "List an act"; in prose, say musician.
- **Patron**: anyone who pays. Subtypes: fan, local business, brand. Never "sponsor", "advertiser", "customer", "buyer".
- **Run**: the period being funded. A tour, a residency, a season, a series of shows. Never "campaign".
- **Board**: a musician's offering for one run. A musician opens a board for a run; patrons back placements on the board.
- **Placement**: one opportunity on a board (a surface, on a run, at a price). "Lot" is the database word; in copy say placement, or "spot" informally.
- **Surface**: a physical or digital place a mark can go (kick head, case sticker, post). The standard card lists them.
- **Backing**: a fan-tier contribution through the widget. Not a placement.
- **Mark**: the patron's name or logo as it will appear. Never "ad", never "creative".
- **Record**: the end-of-run summary a patron receives. Never "receipt" in copy (fine in code for Stripe receipts), never "report".
- **Sponsorship** is fine for the transaction itself. The company is not "an advertising marketplace" or "an influencer platform"; the differentiator is that musicians get paid for the work of being musicians without becoming influencers.

## Voice rules for anything user-facing

These are firm. They apply to page copy, button labels, emails, error messages, empty states and placeholder text.

1. **No second person by default.** Write about musicians, patrons and fans in the third person. "Musicians set their own prices," not "you set your prices." Button labels are imperative or nominal: "List an act", "Back the run", "Get on the list". The exceptions, settled in the 2026-09 copy brief: the hero's second line, the patron steps on the home page, and the pages that speak to musicians directly (List an act, the widget).
2. **Active voice.** Name who does what. "Door Money holds the money," not "the money is held." "Patrons put the money up," not "the money is put up."
3. **Benefits before mechanics.** Lead with what sponsorship does for the act (gas, rooms, the difference between a run that happens and one that doesn't) and what a patron gets (attention, a name in the room, support they can point at). Mechanics (holds, weekly payouts, approvals) come second and stay short.
4. **Plain words.** No insider phrasing, no jargon, no cleverness that needs decoding. "When Door Money opens," not "when doors open." "Attendance," not "through the door."
5. **No em dashes.** Anywhere. Use a comma, a colon, a period, or parentheses.
6. **No invented proof.** A board says what its musician actually ticked on the run, and nothing more. The verification methods live in `src/lib/verification.ts` and reach the page through `PlacementVerification`; never write proof language by hand into a page. Don't promise documentation from every show: the methods say "selected shows" because that is the promise. Don't imply Door Money inspected anything, so no "verified by Door Money", no "confirmed", no certification language. Documentation comes from the musician and Door Money passes it on. Keep the commitment the size it is (see `docs/DECISIONS.md`, decision 9).
7. **Short sentences.** Cut the second clause when the first one already lands.

## Design system

Tokens live in `src/app/globals.css`. Use them; don't introduce new colors or fonts.

Every page is a dark room with one colour of light in it. The room is the same on every page; the light changes per page. Three stage lights (`StageLights`, mounted by `Theme`) throw the accent down the room from a truss above the page and swing as the reader scrolls; they hold still under reduced motion.

- The room: `ground` (page background), `ink` `#F4F0E8` (text), `muted` (secondary text), `line` (1px rules and borders), `panel` (a lifted, translucent block).
- The light: `accent` (fills, glows, rules, display type at 24px and up), `accent-ink` (the tint of the accent that clears 4.5:1 on the ground; use it for any accent text under 24px), `on-accent` (text on an accent fill).
- Themes, set with `<Theme name>` or the `theme` prop on `Page`: blue (home, sign in, dashboard, the embed), lime (placements), magenta (live auctions), amber (list an act), teal (widget), violet (contact), red (404), mono (the legal pages). Boards take a colour by slug through `themeFor`, so each act keeps the same light.
- Smallest text on the site is 14px. Metadata and captions use 14 or 14.5px, body copy 15px and up.
- Bodoni Moda for H1s only, set in caps (the `display` utility; the accent word in a headline is italic). Archivo for everything else: headings below the H1 (the `heading` utility, medium weight), body, and tracked caps labels (the `caps` utility). Nothing else.
- Thin 1px lines (`edge`), no hard shadows, no tilt, no rounded corners except circles. Blocks that should catch the light use `glow` or `lit`. Heroes carry a stage light (`HeroArt`); a photo dropped at `public/hero/<theme>.jpg` appears under it, or pass `photo` to name the file (the home page uses `hero/saxophone.jpg`). The other themes carry public domain Gottlieb club photographs; credits in `public/hero/CREDITS.md`.
- Components in `src/components/`: `Logo` (the mark and wordmark, inline SVG in the current text colour), `Theme`, `StageLights`, `Reveal` (blocks marked `data-reveal` rise in on scroll; `--i` staggers siblings; heroes use the `hero-in` class), `Nav`, `Footer`, `Page`, `HeroArt`, `Eyebrow`, `Stamp`, `Button`, `Section`, `SectionHead`, `Steps`, `Lines`, `NewsletterCTA` and `NewsletterStrip` (the new-boards email: the band on patron pages, the strip in the footer), `PlacementVerification` (what a run promises patrons, on the board), `VerificationEditor` and `ReadinessChecklist` (the dashboard sides of the same thing). Reuse them.

## Engineering rules

- Next.js 16 App Router. `params` and `searchParams` are Promises: await them. `middleware.ts` is now `proxy.ts`.
- Server components by default. Add `"use client"` only for interactivity.
- Supabase for Postgres, Auth, Realtime and Storage. Server-side client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`. Never use the service-role key in client code.
- Stripe Connect with Express accounts, separate charges and transfers. The patron pays Door Money through an embedded Checkout Session; the charge sits on the platform balance and weekly Transfers (with `source_transaction`) move the act's share out. Door Money's 15% is the part never transferred: the schedule is built from amount minus `fee_cents`. Never `application_fee_amount`, never `transfer_data` on the charge. Every Stripe webhook handler must be idempotent: check `stripe_events` before acting, and make each write conditional on the state it expects.
- Money is stored as integer cents in Postgres, never floats. Format with `formatMoney` from `src/lib/money.ts`.
- The widget at `/embed/[slug]` must be frameable by any origin; nothing else may be. See `next.config.ts` headers.
- Standard-card surfaces and prices live in `src/lib/catalog.ts`. Prices there are defaults; the act's own price on a lot always wins.
- Validate every API input with zod. Return typed errors, never raw exceptions.
- Prefer server actions for form posts from our own pages; route handlers for webhooks and for anything the widget calls cross-origin.

## Working with the mockups

`docs/mockups/*.html` are self-contained pages with inline CSS in the old paper look. They are the source for sections, order and copy, not for colour or type. When porting one:

1. Read the whole file first.
2. Reuse the shared components rather than copying the nav and footer. Take the layout and the words from the mockup; take the look from the design system above.
3. Keep the copy word for word unless it breaks a voice rule above, in which case fix it and note it in the commit.
4. Replace hardcoded sample data with reads from Supabase, using the seed data so the result looks the same.
5. Match the layout at desktop and at 380px wide.

## Do not

- Add a light mode. The dark room and the coloured light are the brand.
- Add analytics scripts, chat widgets or third-party embeds to the marketing pages without asking.
- Store card numbers, ever. Stripe Elements only.
- Write "you" anywhere a person will read it.
