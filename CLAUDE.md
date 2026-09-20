# Door Money

Door Money is a category-extensible, city-agnostic sponsorship marketplace connecting sponsors with relevant audiences. We start with music, sports teams, film, and theater and intend to expand to as many categories as can support a clear, deliverable sponsorship promise. Organizers raise money by offering specified visibility. Every sponsorship must make clear both what the funding enables and what the sponsor can count on receiving.

New York may supply more early testers because of the founder's network; it is not an eligibility boundary or a technical default. Design for organizers and audiences anywhere, including online and multi-location activity. Category and geography must not be fixed to the initial cohort. Actual payment availability must reflect supported capabilities, not imply that every country and currency is already enabled.

Read `docs/PRODUCT_CONTRACT.md` first for the current product contract, category definitions, and compatibility rules. `docs/EXPANSION_PLAN.md` governs the five expansion phases. Decision 17 in `docs/DECISIONS.md` supersedes the earlier music-only product scope. `docs/ROADMAP.md` records the original music build, not the expansion plan.

**Implementation status:** the shipped application still implements the music workflow. Expansion Phase 1 changes instructions, decisions, and vocabulary checks; it does not enable the other categories. Preserve existing music data, URLs, and payment behavior until the relevant implementation phase. Historical mockups are music examples, subordinate to this contract and the voice rules.

@AGENTS.md

## Vocabulary

Shared language describes the exchange; category language describes the work. Decision 17 supersedes decision 14's fixed music identity while preserving its plain-language and address-compatibility rules.

- **Organizer**: the person or organization responsible for a fundraiser and its promised delivery. Use this on shared creation and account surfaces. Use musician, team, filmmaker, or theater company where the category is known. A category is not an account role, and an account may organize and sponsor.
- **Sponsor**: someone buying specified visibility through a sponsorship. Use this throughout discovery, offers, checkout, delivery, and the transaction record.
- **Patron**: the broader relationship of supporting work or a community. Use patron rather than supporter as the generic account label. Existing patron accounts and addresses remain valid. Patronage can express purpose; it must not obscure what a sponsor receives.
- **Backer / backing**: the existing recognition contribution through the widget. Keep it distinct from a sponsorship. Do not relabel historic backings as sponsorships or promise new benefits on them.
- **Fundraiser**: one named funding effort with its own category, purpose, goal, timeline, and sponsorship options. Use the actual period where useful: tour, season, production, or screening series. Never board, campaign, or run as the generic product noun.
- **Sponsorship option**: a priced offer describing the visibility available. **Sponsorship** is the exchange. Fixed price and bidding are sale methods, not different categories.
- **Placement**: where a sponsor's name, logo, product, or message appears. It may be physical, digital, printed, or part of a production. The complete purchase is a sponsorship.
- **Deliverable**: a specific promised action or appearance, with a due date or delivery window. **Evidence** documents that delivery; it is not a Door Money certification.
- **Logo**: a sponsor's name or logo for an offer that needs it. Some offers need other materials; logo approval must not become the universal definition of delivery.
- **Record**: the sponsor's summary of the purchased offer, delivery, evidence, and payment outcomes. Keep Stripe receipts distinct from this record.
- **Profile**: a page about an organizer or patron; name the kind when ambiguous. Existing music preferences remain music preferences and are not silently converted into broader interests.
- **Suggested prices**: template defaults. The organizer's chosen price wins.

Door Money leads with relevant audiences, specified visibility, and meaningful support. It does not guarantee sales, audience growth, impressions, distribution, or outcomes it cannot substantiate. Sponsorship is the product's exchange; patronage expresses why that exchange can matter.

Addresses outlive words. Preserve `acts`, `runs`, `lots`, `patrons`, `mark_*`, sent-email links, and existing music addresses. The `musician` stored role remains compatible until Phase 2 introduces neutral account concepts. Phase 3 adds `/fundraisers` with compatibility for `/auctions`; it does not delete old links. Never use a global search-and-replace to rename these identifiers.

`tests/vocabulary.test.ts` guards the current app's retired wording and the authoritative contract's broader scope. Category-specific music wording stays valid. Shared pages, dashboard copy, templates, and emails receive category-aware copy in Phase 3. The current scanner is a heuristic: single-word labels and interpolated strings still require manual review. The four legal pages retain their existing review deferral; launch requires their terms to match the implemented policies.

## Voice rules for anything user-facing

These are firm. They apply to page copy, button labels, emails, error messages, empty states and placeholder text.

1. **The second person only where "you" can mean one person.** The site serves organizers and sponsors, usually on the same page, so editorial copy stays in the third person and names the side it means: "Organizers set their own prices," not "you set your prices." That covers home, how sponsorship works, the fundraiser index, an act's page, a fundraiser's page and the legal pages. Transactional surfaces go the other way: sign up, sign in, the password flows, the dashboard, the patron pages behind an account, form labels, helper text, validation messages, the record and any email about somebody's own money are written to the person doing the thing, in the second person. A marketing page with only one audience (the organizer invitation, the widget) may use either, and both use the second person today. Button labels are imperative or nominal everywhere: "Create a fundraiser", "Find sponsorships", "Create an account". Settled in `docs/DECISIONS.md`, decision 15.
2. **Active voice.** Name who does what. "Door Money holds the money," not "the money is held." "Patrons put the money up," not "the money is put up."
3. **Benefits before mechanics.** Lead with what sponsorship funds for the organizer (travel, equipment, production, or performances) and what a sponsor gets (attention, a name in the room, support they can point at). Mechanics (holds, weekly payouts, approvals) come second and stay short.
4. **Plain words.** No insider phrasing, no jargon, no cleverness that needs decoding. "When Door Money opens," not "when doors open." "Attendance," not "through the door."
5. **No em dashes.** Anywhere. Use a comma, a colon, a period, or parentheses.
6. **No invented proof.** A fundraiser says what its organizer actually committed to, and nothing more. The verification methods live in `src/lib/verification.ts` and reach the page through `PlacementVerification`; never write proof language by hand into a page. Don't promise documentation from every show: the methods say "selected shows" because that is the promise. Don't imply Door Money inspected anything, so no "verified by Door Money", no "confirmed", no certification language. Documentation comes from the organizer and Door Money passes it on. Category-specific evidence and permissions arrive in Phase 4. Keep the commitment the size it is (see `docs/DECISIONS.md`, decision 9).
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

### Semantic domain components

`src/components/domain/` is the contract between the domain and the design: `OrganizerProfileHeader`, `FundraiserHeader`, `CategoryBadge`, `FundingPurpose`, `AudienceSummary`, `SponsorPromise`, `OpportunityCard`, `OpportunityEditor`, `DeliveryCommitment`, `EvidenceSummary`, `SponsorProfileCard`, `PatronActivityItem`, `LocationSummary`, `FundraiserStatus`. A redesign changes these files and should not need to change what they are given.

- They take views from `src/lib/domain.ts` and nothing else. A page loads rows, maps them to views, and passes them down. A domain component never queries Supabase, never imports a server action, never starts a payment (`OpportunityCard` is handed its `action`), and never imports `src/lib/catalog.ts`, `src/lib/sample.ts` or a music-only type. `tests/domain-components.test.ts` checks this from their source.
- Category nouns come from `src/lib/category-words.ts`, never from a literal in a component. That is how "the musician" and "the logos" got onto a theater page. Music's words are music's and stay; they are just nobody else's default. A category's public name is data (`{ key, label }`, from the registry), so a fifth category renders with no code written for it.
- What is not known is not drawn: no city, no count, no date, no suggested price, and no placeholder in their place.
- `src/lib/fixtures/domain-fixtures.ts` has one full set of views for music, sports, film and theater. Render a new or redesigned component against all four before it ships; the test does.
- Music-specific components stay music-specific and say so: `ShowsPanel`, `RunForm`, the widget's backing tiers.

## Engineering rules

These describe the existing music implementation unless explicitly marked otherwise. Expansion requirements live in the product contract. Friday transfers and logo approval are current mechanics, not universal promises for new categories.

- Next.js 16 App Router. `params` and `searchParams` are Promises: await them. `middleware.ts` is now `proxy.ts`.
- Server components by default. Add `"use client"` only for interactivity.
- Supabase for Postgres, Auth, Realtime and Storage. Server-side client in `src/lib/supabase/server.ts`, browser client in `src/lib/supabase/client.ts`. Never use the service-role key in client code.
- Stripe Connect with Express accounts, separate charges and transfers. The patron pays Door Money through an embedded Checkout Session; the charge sits on the platform balance and weekly Transfers (with `source_transaction`) move the act's share out. Door Money's 15% is the part never transferred: the schedule is built from amount minus `fee_cents`. Never `application_fee_amount`, never `transfer_data` on the charge. Every Stripe webhook handler must be idempotent: check `stripe_events` before acting, and make each write conditional on the state it expects.
- Money is stored as integer cents in Postgres, never floats. Format with `formatMoney` from `src/lib/money.ts`.
- The widget at `/embed/[slug]` must be frameable by any origin; nothing else may be. See `next.config.ts` headers.
- The current music sponsorship options and their suggested prices live in `src/lib/catalog.ts`. Prices there are defaults; the musician's own price on a lot always wins.
- Validate every API input with zod. Return typed errors, never raw exceptions.
- Public reads of anything a patron owns go through a sanitised view (`public_patron_profiles`, `public_patron_activity`, `lot_buyers`, `run_backers`), granted to `anon` and selecting only public columns. Never open `profiles`, `purchases`, `backings`, `bids` or `patrons` to the browser: they hold email addresses, amounts and Stripe ids. Selecting a private column and hiding it in React is not privacy.
- A patron's public profile and each item on it are off by default, in the database, and are turned on one at a time. An anonymous bid is never publishable, whatever a form says.
- A view is a read path and never a write path. Every public view here is built `with (security_invoker = false)` so it can select past row level security, which also means a *write* through it reaches the base table with RLS switched off. Postgres will auto-update any view simple enough (one table, no join, no union), so the only thing standing between the default grants and a rewritten table is the view's shape. Revoke insert, update, delete and truncate on every view, and never grant them back. Migration 0030 closed this; `supabase/tests/permissions_test.sql` holds it.
- TRUNCATE ignores row level security by design, so a policy is no defence against it. `anon` and `authenticated` hold it on nothing.
- A new table is outside the Data API boundary until its grants are revoked. Row level security with no policy still answers PostgREST `200 []` rather than refusing, so the migration that creates a table decides its `anon` and `authenticated` grants in the same file, and `supabase/tests/permissions_test.sql` gets an assertion for it. Migration 0022 was a snapshot; 0029 had to catch up eight tables it never covered.
- Usernames are claimed and changed through `claim_username` (migration 0024) and nowhere else. It holds the whole namespace (`profiles.username` and `acts.slug`), the twelve-month rule, the retired-word list, and the atomic move of a musician's own address. `RESERVED_SLUGS` in `src/lib/slug.ts` still has to grow whenever a top-level route does.
- Patron profile photos live in the private `patron-photos` bucket and are only ever reached through a short-lived signed URL minted on the server. Act and show photos stay in their public buckets.
- Prefer server actions for form posts from our own pages; route handlers for webhooks and for anything the widget calls cross-origin.

## Working with the mockups

`docs/mockups/*.html` are self-contained pages with inline CSS in the old paper look. They are the source for sections, order and copy, not for color or type. When porting one:

1. Read the whole file first.
2. Reuse the shared components rather than copying the nav and footer. Take the layout from the mockup and the look from the design system above. Apply the current product contract to the words.
3. Keep copy only where it fits the current category and product contract, follows the voice rules, and uses current vocabulary. Rewrite conflicting copy and note the change in the commit.
4. Replace hardcoded sample data with reads from Supabase, using the seed data so the result looks the same.
5. Match the layout at desktop and at 380px wide.

## Do not

- Add a light mode. The dark room and the colored light are the brand.
- Add analytics scripts, chat widgets or third-party embeds to the marketing pages without asking.
- Store card numbers, ever. Stripe Elements only.
- Write "you" on a page that talks to organizers and sponsors at once. The second person belongs on the pages somebody uses, not the pages that describe the market. See voice rule 1.
