# Open decisions

Product questions that came up while building the mockups and don't have an owner's answer yet. Each one blocks or shapes a phase. The codebase picks a default so work can continue; the default is marked, and changing it later is cheap if it's changed before the phase that depends on it.

---

## 1. The tagline

**Blocks:** Phase 1

"Proof or it doesn't pay" is on every page. The copy around it no longer explains the proof mechanism, so a first-time reader hits the line without context.

Options on the table:
- Keep it.
- "The money shows up before the show does."
- "Money that reaches the band while they're still on the road."
- Something new.

**Default in code:** kept, as `SITE.tagline` in `src/lib/site.ts`. One string to change.

---

## 2. What releases the money

**Blocks:** Phase 3

The copy says money reaches the act "as the run happens, weekly." Something has to decide that the run is happening. Three candidates:

**A. Calendar.** Funds release in equal weekly slices between the run's start and end dates. The act can cancel, which refunds the remainder. No evidence required. Simplest, and patrons get exactly what the copy promises.

**B. Act confirms.** Each week's slice releases when the act marks that week's shows as played. Light evidence, one tap per show. Slightly more friction, slightly more trust.

**C. Photo per show.** The original mockup mechanism. Highest trust, highest burden, and the copy was deliberately moved away from it.

**Default in code:** A, with the show-list and "played" toggle from Phase 6 layered on later as B if patrons ask for it. The `payout_schedule` table is built to support either.

---

## 3. Who pays through the widget

**Blocks:** Phase 4

The site was written for business patrons buying placements. The widget's $25 and $100 tiers open Door Money to individual fans, with recognition (a name on the tour thank-you, a name on the merch table card) instead of a logo on a surface.

This is a real expansion of the model, and it's a good one for a widget, since a fan doesn't want a logo on a kick drum. But it means two product lines: placements for businesses, backing for fans. It affects the data model (a `backing` is not a `lot`), the copy on the widget page, and the end-of-run record.

**Default in code:** both, as separate tables. `lots` for placements, `backings` for fan tiers. The widget shows fan tiers and links to the board for placements.

---

## 4. Auction mechanics

**Blocks:** Phase 5

Straight bidding (each bid is exactly what the patron pays) or proxy bidding (the patron sets a maximum, the system bids up to it). Straight is simpler to explain and to build. Proxy ends auctions at fairer prices and reduces sniping.

**Default in code:** straight bidding. The `bids` table stores `amount` only; adding a `max_amount` column later is straightforward.

---

## 5. The domain

**Blocks:** Phase 1 deploy, Phase 4 snippet

The mockups use `doormoney.co` as a placeholder. The real domain sets the snippet URL every act pastes into their site, so it has to be settled before Phase 4 and shouldn't change after.

**Default in code:** `NEXT_PUBLIC_SITE_URL` in `.env.example`, referenced everywhere the domain appears.

---

## 6. Real names on the sample boards

**Blocks:** nothing, but worth settling before launch

Rosie's board names real companies as example buyers (Marcus Bonna, Heckel, Forrests Music and so on) with a disclaimer that none are involved. The lots above them show invented patrons. This split is deliberate but a reader could take the real names as customers.

Options: keep with the disclaimer, replace with invented names, or replace with real names only once any of them actually buys.

**Default in code:** kept, with the disclaimer, in the seed data.

---

## 7. Anonymous patrons

**Blocks:** Phase 5

Both sample boards show "Anonymous patron" as a bidder. Anonymity is fine for the board but the act has to know who they're approving a mark for, and the mark itself is by definition not anonymous.

**Default in code:** `bids.anonymous` hides the patron name on the public board only. The act always sees it.
