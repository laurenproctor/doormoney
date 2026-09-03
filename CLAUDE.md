# Door Money

Sponsorship marketplace for working musicians in New York. Local businesses and gear brands put money behind bands, house acts and soloists: a name on the kick drum, the road cases, the tip jar, a post. Door Money holds the money and pays the act weekly through the run. Fans can also back an act through an embeddable widget.

Read `docs/ROADMAP.md` for the phases and `docs/DECISIONS.md` for the open product questions and the defaults this codebase assumes. The seven HTML files in `docs/mockups/` are the design spec; port from them, don't redesign.

@AGENTS.md

## Vocabulary

Use these words and only these words for these things.

- **Act**: any musician or group that lists. Also "band" when the act is a band, "musician" generically. Never "artist" in product copy, never "creator", never "user".
- **Patron**: anyone who pays. A business buying a placement, a brand, or a fan backing through the widget. Never "sponsor", "advertiser", "customer", "buyer".
- **Run**: the thing a patron backs. A tour, a season, or a residency month. Never "campaign".
- **Surface**: a physical or digital place a mark can go (kick head, case sticker, post). The standard card lists them.
- **Lot**: one surface, on one run, at one price. What a business patron buys.
- **Backing**: a fan-tier contribution through the widget. Not a lot.
- **Board**: an act's public page of lots for the current run.
- **Mark**: the patron's name or logo as it will appear. Never "ad", never "creative".
- **Record**: the end-of-run summary a patron receives. Never "receipt" in copy (fine in code for Stripe receipts), never "report".

## Voice rules for anything user-facing

These are firm. They apply to page copy, button labels, emails, error messages, empty states and placeholder text.

1. **No second person.** Never "you", "your", "yours". Write about musicians, acts, patrons and fans in the third person. "Acts set their own prices," not "you set your prices." Button labels are imperative or nominal: "List an act", "Back the run", "Get on the list".
2. **Active voice.** Name who does what. "Door Money holds the money," not "the money is held." "Patrons put the money up," not "the money is put up."
3. **Benefits before mechanics.** Lead with what sponsorship does for the act (gas, rooms, the difference between a run that happens and one that doesn't) and what a patron gets (attention, a name in the room, support they can point at). Mechanics (holds, weekly payouts, approvals) come second and stay short.
4. **Plain words.** No insider phrasing, no jargon, no cleverness that needs decoding. "When Door Money opens," not "when doors open." "Attendance," not "through the door."
5. **No em dashes.** Anywhere. Use a comma, a colon, a period, or parentheses.
6. **No per-show proof language.** Don't describe nightly photos, geotags, timestamps or verification steps. The product tracks runs lightly (see Phase 6); the copy doesn't dwell on it.
7. **Short sentences.** Cut the second clause when the first one already lands.

## Design system

Tokens live in `src/app/globals.css` and mirror the mockups exactly. Use them; don't introduce new colors or fonts.

- Paper `#EDE8DC` (page background), black `#000000`, red `#E03A1E`, tape `#F2C230`, gray `#55524B`
- Anton for display and buttons (uppercase), Special Elite for typewriter accents and metadata, Archivo for body
- Hard black borders (3px), hard offset shadows (no blur), tilted tape labels, circular red stamps
- Components in `src/components/`: `Nav`, `Footer`, `Tape`, `Stamp`, `Button`, `Wordmark`. Reuse them.

## Engineering rules

- Next.js 16 App Router. `params` and `searchParams` are Promises: await them. `middleware.ts` is now `proxy.ts`.
- Server components by default. Add `"use client"` only for interactivity.
- Supabase for Postgres, Auth, Realtime and Storage. Server-side client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`. Never use the service-role key in client code.
- Stripe Connect with Express accounts, separate charges and transfers. Door Money's 15% is an `application_fee_amount` on the transfer. Every Stripe webhook handler must be idempotent: check `stripe_events` before acting.
- Money is stored as integer cents in Postgres, never floats. Format with `formatMoney` from `src/lib/money.ts`.
- The widget at `/embed/[slug]` must be frameable by any origin; nothing else may be. See `next.config.ts` headers.
- Standard-card surfaces and prices live in `src/lib/catalog.ts`. Prices there are defaults; the act's own price on a lot always wins.
- Validate every API input with zod. Return typed errors, never raw exceptions.
- Prefer server actions for form posts from our own pages; route handlers for webhooks and for anything the widget calls cross-origin.

## Working with the mockups

`docs/mockups/*.html` are self-contained pages with inline CSS. When porting one:

1. Read the whole file first.
2. Reuse the shared components rather than copying the nav and footer.
3. Keep the copy word for word unless it breaks a voice rule above, in which case fix it and note it in the commit.
4. Replace hardcoded sample data with reads from Supabase, using the seed data so the result looks the same.
5. Match the layout at desktop and at 380px wide.

## Do not

- Add a dark mode. The paper palette is the brand.
- Add analytics scripts, chat widgets or third-party embeds to the marketing pages without asking.
- Store card numbers, ever. Stripe Elements only.
- Write "you" anywhere a person will read it.
