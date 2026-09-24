# The Desk register

**Done, 2026-09-23.** All five PRs shipped. The workspace is on the register end to end: the shell and
the rail, Today, the fundraiser page, Money, `/patron`, `/dashboard/profile`, `/dashboard/account` and
`/admin`. What is written below is the plan as it was worked, kept because it says why each piece is the
shape it is; the rules it settled now live in CLAUDE.md, under "Two registers: Stage and Desk", which is
what to read first. Two things in it were not built and are named at the end.

How the signed-in workspace gets the blended design (degrees 2, 3 and 4 on the canvas): Door Money's room and light, product-dashboard structure, and the small conventions people already know. This file is the build plan. Drop it at `docs/DESK_REGISTER.md`, read CLAUDE.md first, and work the PRs in order.

Reference: the "Blend of 2, 3 and 4" row on the Design canvas (Today and the fundraiser page, dark and light).

## Branching

Start now, on a feature branch. Do not wait for other work to stop.

- Branch from `main`: `git switch -c feat/desk-register`.
- Ship it as five small PRs, each mergeable on its own (below). PR 1 touches no page and cannot conflict with anything; merge it first and branch the rest from it.
- Files other work is likely to touch at the same time: `src/components/DashboardShell.tsx` (last changed in #69, the rail fold), `src/app/dashboard/page.tsx`, `src/app/dashboard/runs/[id]/page.tsx`, `src/lib/dashboardModel.ts`, `src/app/globals.css`. The plan only appends to `globals.css` and replaces the other four whole, so a rebase either applies cleanly or is a one-sided conflict you resolve by keeping the new file. Rebase on `main` daily: `git fetch origin && git rebase origin/main`.
- Nothing here touches migrations, Stripe, the webhook, cron routes or the public pages. The Stage register (marketing) is untouched by design.
- `npm run verify` must pass before each PR. `tests/contrast.test.ts` will fail the moment a new color token misses 4.5:1 in either room; that is the point of it.

## What changes, in one paragraph

Two registers over one set of tokens. **Stage** is the public site as it is. **Desk** is the workspace: same room, same light per organizer, but scanned rather than read. The Desk register is a `data-register="desk"` attribute on the workspace shell, a block of CSS scoped to it, five primitives, and two rebuilt pages (Today, and the fundraiser page). Status gets a shape: ok is the organizer's own light, attention is amber, draft is neutral, and nothing else is colored. Cards get an 8px radius, controls 6px, pills are round. Stage lights, reveal animation and hero art are off inside the register; one static pool of the accent sits at the top of the page.

## Rules that carry over unchanged

From CLAUDE.md, and the tests enforce most of them:

- Tokens only. No new hex outside `globals.css`. Every new token is computed against its ground and added to `tests/contrast.test.ts` for all eight themes in both rooms.
- `accent-line` for anything interactive (focus rings, button edges, selected tiles). Never `border-accent`.
- Smallest text is 14px. The canvas mockups used 13.5px and 12.5px in a few spots (badge text, table headers, the ⌘K hint); implement all of them at 14px.
- Second person on the dashboard, sentence-case buttons, no em dashes, no invented proof, no numbers the rows cannot back.
- Category-neutral copy on shared surfaces (`tests/category-neutral-copy.test.ts`). "Shows" and the run strip are music's; take the word from `periodOf(run.kind)` / `categoryWords(categoryKey)` and render the strip only when the category has dated events.
- Vocabulary (`tests/vocabulary.test.ts`): fundraiser, sponsorship option, organizer, sponsor, patron, backing. Addresses do not change: `/dashboard/runs/[id]`, `/dashboard/payouts`, `/patron` stay where they are; only labels change.

## Rules that change (write these into CLAUDE.md and DECISIONS.md in PR 1)

- "No rounded corners except circles" becomes "no rounded corners on the Stage register; on the Desk register cards are 8px, controls 6px, pills round."
- "Bodoni for H1s only" stays true; on Desk the H1 is the thing you own (the organizer's name on Today, the fundraiser's name on its page), set at 36px, and there is one per screen.
- Caps (`.caps`) on Desk are for status words inside badges and nothing else. Nav, buttons, table headers and labels are sentence case.
- Stage lights, `hero-in` and `data-reveal` do not run inside `[data-register="desk"]`.
- Add decision 20 to `docs/DECISIONS.md`: the two registers, what each is for, and the ok/attention/neutral rule.

## PR 1: tokens, register CSS, primitives (no visible change)

**`src/app/globals.css`**, appended after the light-room block:

```css
/* Status, cut from the light. ok IS the accent: an open fundraiser under a blue organizer is blue.
   attention is the one color that does not change with the theme, so it means the same thing in
   every room. neutral is the ink at low strength. Each has a wash for a pill and an ink for text. */
:root, [data-theme] {
  --ok: var(--accent);
  --ok-ink: var(--accent-ink);
  --ok-wash: color-mix(in srgb, var(--accent) 14%, transparent);
  --attention: #ffb020;
  --attention-ink: #ffb020;
  --attention-wash: rgba(255, 176, 32, 0.16);
  --neutral-ink: var(--muted);
  --neutral-wash: color-mix(in srgb, var(--ink) 8%, transparent);
  --surface: color-mix(in srgb, var(--ink) 4%, var(--ground));
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.5);
  --radius-card: 8px;
  --radius-control: 6px;
}
:root[data-mode="light"], [data-mode="light"] [data-theme] {
  --ok-wash: color-mix(in srgb, var(--accent) 35%, transparent);
  --attention-ink: #8a5a00;
  --attention-wash: #fbeecf;
  --surface: #ffffff;
  --shadow-1: 0 1px 2px rgba(20, 19, 26, 0.06);
}

/* The Desk register: the workspace. Same tokens, scanned rather than read. */
[data-register="desk"] { font-size: 15px; line-height: 1.45; }
[data-register="desk"] p { max-width: none; }
[data-register="desk"] .display { font-size: 36px; line-height: 1; }
[data-register="desk"] .stage-lights { display: none; }
[data-register="desk"] [data-reveal] { opacity: 1; transform: none; transition: none; }
[data-register="desk"] .hero-in > * { animation: none; }
[data-register="desk"] .pool-static {
  background-image: radial-gradient(ellipse 70% 60% at 50% 0%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 70%);
}
```

Add the new tokens to the `@theme inline` block so Tailwind sees them (`--color-ok`, `--color-ok-ink`, `--color-ok-wash`, `--color-attention-ink`, `--color-attention-wash`, `--color-neutral-wash`, `--color-surface`, `--radius-card`, `--radius-control`, `--shadow-1`).

**`tests/contrast.test.ts`**: add `attention-ink` on `ground` and on `surface`, `ok-ink` on `ok-wash` over `surface`, `attention-ink` on `attention-wash`, `neutral-ink` on `neutral-wash`, all eight themes, both rooms. The dark amber `#ffb020` clears 4.5:1 on every dark ground; the light amber `#8a5a00` clears it on every light ground and on `#fbeecf`. If a theme fails, darken the ink, never lighten the ground.

**`src/components/Theme.tsx`**: add `lights?: boolean` (default true). When false, do not render `<StageLights />` or `<Reveal />`. Nothing else changes.

**`src/components/desk/`** (new folder; every component takes plain props, imports nothing server-only, and is rendered in a test against the music, sports, film and theater fixtures the way `tests/domain-components.test.ts` already does):

- `Card.tsx`: `--surface` fill, 1px `line` border, `--radius-card`, `--shadow-1`, 20px padding, `gap-3`. Props: `title`, `subtitle`, `right` (a slot), `children`, `id`.
- `Kpi.tsx`: label 14px muted, value 26px `heading` tabular, optional `extra` slot (the bar lives here on the first tile), sub 14px muted.
- `Badge.tsx`: `kind: "ok" | "attention" | "neutral"`, glyph plus word, pill, 24px tall, 14px. ok uses a filled dot in `--ok`, attention a filled dot in `--attention`, neutral a hollow dot. The word is what a screen reader gets; the dot is `aria-hidden`.
- `Button.tsx`: extend the existing `src/components/Button.tsx` with `register="desk"` rather than a second button. Desk variants: `solid` (accent fill, `accent-line` edge, 36px, `--radius-control`, sentence case), `outline` (`field-line` edge), `quiet` (no edge). `size="sm"` is 32px for row actions.
- `Table.tsx`: a CSS-grid table. Header row 14px muted, 1px rules between rows, `min-h-[44px]` rows, last column reserved for a kebab (`More`, `aria-label`, 32px). Rows can be links.
- `TaskRow.tsx`: lead slot (logo thumbnail, avatar, or a date block), title, one line of detail, actions slot. This is the row under "Needs you".
- `MoneyBar.tsx`: one bar, three segments: paid (accent), bids (hatched accent), open (empty), with `role="img"` and an `aria-label` that states all four numbers. Takes cents.
- `Tabs.tsx`: link tabs with optional counts; a count can be `attention`. Current tab is a 2px `accent-line` underline. Tabs are `<a href="?tab=…">` so the fundraiser page stays a server component and every tab is a URL.
- `RunStrip.tsx`: music only, lives next to `ShowsPanel`. Takes `ShowRow[]`; draws one circle per date, the next date filled in `--ok` with an `--ok-wash` ring, played dates with a check, a date missing venue or city as a hollow `--attention` circle that links to `#shows`. Month labels at the ends. Never invents a date: no rows, no strip.

Nothing in this PR changes a page. It merges the moment `verify` is green.

## PR 2: the shell

Replace the internals of `src/components/DashboardShell.tsx` and keep its name, its props and its exports (`Card`, `CardHead`, `inputClass`, `labelClass`), so no call site moves. `Card`/`CardHead` re-export the new desk `Card` with the old signature.

- Wrap in `<Theme name={theme} lights={false}>` with `data-register="desk"` on the wrapper. `theme` is a new prop: pages pass `themeFor(act.slug)` for an organizer, the patron's `PROFILE_THEMES` choice on `/patron`, `"blue"` for account and settings, `"mono"` for `/admin`. The default stays `"blue"` so nothing regresses before a page opts in.
- Layout: sidebar 232px with the Bodoni wordmark at top, five items with icons (Today, Fundraisers, Money, Backed by you; divider; Profile, Settings), the "bidding closes in" note above the account block when the organizer has an open fundraiser with bids, and the account block (initials, name, organizer) at the foot. The rail fold from #69 stays as it is; the drawer under `lg` stays.
- Top bar: breadcrumb on the left, right side holds Search (see PR 5), `Public page ↗` (links to `runPath`'s organizer page), and the page's one primary action (`Create fundraiser` on Today, nothing on a fundraiser page).
- `src/lib/dashboardModel.ts` `dashboardNav`: labels become Today (`/dashboard`), Fundraisers (`/dashboard/runs`), Money (`/dashboard/payouts`), Backed by you (`/patron`), Profile, Settings. Remove `Site widget` from the nav; it reappears under Share on the fundraiser page in PR 4. `currentNavHref` is unchanged.
- The H1 in the shell is the `display` class at 36px with the italic accent word, as today, just smaller.

`tests/dashboard.test.ts` covers `dashboardNav`; update the expected labels.

## PR 3: Today (`src/app/dashboard/page.tsx`)

Rewrite the page. Every number is one already computed in `src/lib/dashboard.ts`, `src/lib/dashboardModel.ts` or `src/lib/dashboard-home.ts`; the page adds no arithmetic of its own.

Order, top to bottom:

1. **Title row.** Organizer name in Bodoni, an ok badge naming the newest open fundraiser and its status, and one sentence: how many things need doing and the next date they are due before. Build the sentence from `preparationItems(...)` (count) and `upcomingShow(...)` (date and city). When nothing is waiting: "Nothing is waiting on you. The next show is Fri, Oct 3 in Brooklyn." When there is no open fundraiser, the sentence is the draft's next step, from `ReadinessChecklist`'s items.
2. **KPI row**, four tiles: Raised toward goal (with `MoneyBar` when `goal_cents` is set, else without the open segment); Sponsorships (sold · with bids, sub: how many without); Coming to you (settled purchases less `feeCents(amount, SITE.feePercent)`, sub: released so far from `groupPayouts`); Next show (music) or Next date (other categories, from the period's end date). Use `feeCents` and `SITE.feePercent`; never write 15 in a component.
3. **Needs you** (`Card`, 1.55fr) with `TaskRow`s. Each row does its work in place:
   - A submitted logo: thumbnail from `mark_url`, sponsor name, amount, paid date, the offer's promise from `lots.offer_terms`, and `Approve` / `Decline` calling `decideMark(purchaseId, decision)` from `src/app/actions/marks.ts` through a small client form. The row disappears on success because the query no longer returns it.
   - A show missing a venue or city: date block, count, `Add venues` linking to the fundraiser page's Shows tab with the first incomplete row focused. Inline editing from Today comes after PR 0 below; until then it links.
   - Anything with no deadline (a paid sponsorship with no logo yet) goes in one muted line under the rows with `Send a reminder`, which calls the reminder path in `src/lib/marks.ts` for that purchase (one action, one row, no batch).
4. **Money** (`Card`, 1fr): the sentence, the bar, four rows (Paid, Bids held until close, Coming to you after the fee, Released so far), link to `/dashboard/payouts`.
5. **Fundraisers** (`Card` with `Table`): name and period, status badge, raised of goal, next date, waiting-on-you badge (attention when the count is above zero), kebab with Share / Preview / Edit. Drafts show their readiness step count instead of money.

Remove the two "Create / Discover" cards, the "Complete your profile" card and the "Backed by you" top-five; backing has its own page and its own nav item. Delete the local `SectionHead` in this file and the duplicate `payout_schedule` read; `loadDashboard` already returns those totals.

## PR 4: the fundraiser page (`src/app/dashboard/runs/[id]/page.tsx`)

- **Header**: breadcrumb (Fundraisers / title), Bodoni title, ok badge with the lifecycle word, category · period · date range in muted, one sentence (bidding close and next date, both from rows), and three outline buttons: `View ↗` (`previewTarget`), `Share` (opens a small panel: public address with Copy, and the widget snippet moved here from `/dashboard/widget`), `Edit details`.
- **Tabs** (`?tab=`): Overview (default), Options (count), Delivery (count of purchases whose mark or evidence is waiting, attention when above zero), Shows (music only, count) or the period's dated-events word, Details. The old cards map onto tabs as: "How it is going" → Overview header and KPI row; "Where this stands" → the draft-only stepper (below); "Step three of four" → Options; "Step four of four" → Details (verification lives with the commitment); "Delivery" and "Sponsorships" → Delivery; "The shows" → Shows; "Dates and details" → Details.
- **Drafts** get a real stepper instead of "Step three of four": four steps from `ReadinessChecklist`, each a link, the first incomplete one marked current. It disappears at publish.
- **Overview**: KPI row (Raised with bar; Sponsorships; Bidding closes, from `auctions` end time, only when any lot is bidding; Shows played), then `Needs you` (1.55fr) beside `The run` (`RunStrip`, music only; other categories get the delivery commitment card here), then `Sponsorship options` as a `Table`: option, sale method, current amount (top bid, price, or "asking"), status badge (Review logo = attention; Top bid and Sold = ok; No bids = neutral), sponsor (a name for a settled purchase, "Held until close" for a bid, nothing otherwise), and one action per row (`Review` solid for a submitted logo, `Record` link otherwise, `Lower the price` for an option with no bids and no purchase). Collapse options in the same state and sale method onto one row only when there are more than eight.
- **Options tab** is `LotsEditor` and `OfferTermsEditor` as they are, inside `Card`s. **Delivery** is `DeliveryPanel` and `SponsorshipWorkTable` as they are. **Shows** is `ShowsPanel`. **Details** is `RunForm`, `VerificationEditor` and the cancel/unpublish controls. These components keep their internals; only their frame changes. Rewriting them is out of scope for this branch.

## PR 5: the rest of the workspace, and cleanup

- `/dashboard/payouts` becomes "Money" in its title and copy, in the register; keep the address.
- `/patron` takes the register with the patron's theme; `/dashboard/profile` and `/dashboard/account` take blue; `/admin` takes mono and passes its own `nav` so staff stop seeing the organizer sidebar.
- Search in the top bar: a client component that filters the rows already on the page (options, sponsors, shows) and, from anywhere, jumps to a fundraiser by title. No new query. ⌘K opens it. If this slips, ship the bar without search rather than with a search that does nothing.
- Delete `/dashboard/widget` as a nav destination (keep the route for the sent links; it redirects to the newest fundraiser's Share panel). Delete `dashboard-home.ts` if PR 3 left nothing using it, and the six unused `Field` components once `inputClass` has one home.
- Update CLAUDE.md's design system section with the register rules above, and the implementation-status paragraph.

## PR 0, before any inline action ships from Today

`src/app/actions/shows.ts` checks ownership by reading `shows`, which is publicly readable, so the check proves nothing; it passes the client's `patch` object straight to `.update()`; and `uploadShowPhoto` writes to the public bucket with the service role before ownership is proven. Fix all three (resolve the run's owner through `runs` and the caller's account, allow-list the patch keys, check ownership before the upload). This is a one-hour PR that should merge before PR 3, because Today makes these actions one click away. The audit's other items (admin email confirmation, `placeBid` without the payment gate, anonymous checkout holds) are unrelated to this branch and should be their own PRs.

## What shipped, and what did not

PR 1 (tokens, register CSS, primitives), PR 2 (the shell), PR 3 (Today), PR 4 (the fundraiser page) and
PR 5 (the rest of the workspace) are all in. PR 0's three fixes to `src/app/actions/shows.ts` went in
before Today's inline actions, as planned.

Two items in PR 5 were deliberately left, and one of them has since closed:

- **`/dashboard/widget` redirects now (2026-09-23).** It stopped being a nav destination in PR 2, which
  is the half of the item that mattered. The redirect waited for the fundraiser page's Share panel to
  hold everything the old page drew, because until then it would have taken the embed code out of the
  product rather than moved it. The panel holds all of it now (the snippet, the button and its address,
  the two badges and the downloads), so the route answers with a redirect and nothing else: the newest
  published fundraiser with its Share panel open, a running one before a closed one, or Today with a
  one-line notice when nothing is published. `widgetDestination` in `src/lib/dashboardModel.ts`
  decides. The address stays, for the links already sent.
- **The six unused `Field` components were not deleted, because there are none.** Eight files declare a
  `Field` of their own and every one of them is used where it is declared; `ActForm`'s and
  `ProfileForms`' are imported by `RunForm` and `AccountForms` besides. `inputClass` already has one home
  in `DashboardShell` and every form reads it from there. `dashboard-home.ts`'s one dead export,
  `profileGaps`, went with PR 3's profile card and is gone.

## Definition of done

- `npm run verify` green on every PR.
- `tests/contrast.test.ts` extended and passing in both rooms for the new tokens.
- Every Desk component rendered against the four category fixtures in a test.
- Today and the fundraiser page carry no number that is not derived from a row, no text under 14px, no `border-accent` on anything interactive, no em dash, and no word from the retired list.
- The public site renders pixel-identical to `main` (spot-check home, `/fundraisers`, one fundraiser page, `/how-sponsorship-works`), because nothing in the Stage register was touched.
