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

**Decided (2026-09-03):** "Put money behind the music." with a second line, "Support the musicians you want to keep hearing." Both live in `SITE` in `src/lib/site.ts`. The hero shows both; the footer and emails show the first line alone.

Note: the second line uses "you", which the voice rules in `CLAUDE.md` otherwise ban. Treated as a deliberate exception for the tagline only.

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

**Settled 2026-09-03:** straight bidding, built in Phase 5. The next bid is the current top plus `bidStepCents` (5% of the list price, rounded up to $5, never under $5), or the reserve when nobody has bid. Sniping is untreated for now: there is no extension when a bid lands near the close.

**Take it now, settled 2026-09-03:** an auction spot can carry an optional set price above the reserve. It stands while the bidding is below it and disappears once a bid reaches it, so nobody jumps a queue that has already passed the number. Taking a spot ends the bidding at once and charges the whole amount; the bidders are told and are never charged.

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

---

## 8. What a musician signs in with

**Blocks:** Phase 2 onwards

Sign-in was a one-time email link and nothing else. Two things pushed against that: acts asked for a password, and the board address had no owner until an act was listed, so nothing reserved the word a musician wanted.

**Decided (2026-09-04):** one word does both jobs. The username claimed at sign-up is the board address: whoever holds `gutter-hymns` signs in as that and their board is at `/board/gutter-hymns`. It lives on `profiles.username`, the board address stays on `acts.slug`, and two triggers in `0019_usernames.sql` keep the pair from drifting or from being claimed twice. `RESERVED_SLUGS` in `src/lib/slug.ts` is the one list guarding both, so it has to grow whenever a top-level route does.

The email link stays as a second way in, for accounts that never set a password. Forgotten passwords go through `/forgot`, which reports the same thing whether or not the account exists.

Open, and not settled here: whether changing the board address later should move the username with it. It does today, on the act page, which means a musician who renames the board also renames their sign-in. The alternative is to freeze the username at sign-up and let the board address drift, at the cost of the one-word promise.

---

## 9. What a board promises patrons

**Blocks:** Phase 2, and the copy rule in `CLAUDE.md`

The copy was moved away from proof language early on (decision 2, option C), and rule 6 in `CLAUDE.md` banned it outright: no nightly photos, no timestamps, no verification steps. That was the right call against the original mockup mechanism, where every show owed a photograph. It was too wide. A patron paying $1,200 for a kick head still wants to know what comes back, and a blanket ban left the board silent about it.

**Decided (2026-09-04):** a musician says what will come back, per run, from a fixed list. The list lives in `src/lib/verification.ts`, the choice on `runs.verification_methods` and `runs.verification_other` (migration 0020), and the board renders only what was ticked, through `PlacementVerification`.

Three limits hold the promise to its size:

- **Only what was chosen.** Nothing is on by default and nothing is written into a page by hand. A run with nothing ticked shows no section at all, which is what every board published before this does.
- **Never every show.** The photo option says "selected shows" and stays that way. Door Money does not ask a musician to document a night to get paid; the release rule is still the calendar (decision 2, option A).
- **Never Door Money's word.** The disclosure under the list says documentation comes from the musician and appears in the Door Money record. Door Money passes it on. It does not go and look, so nothing on the site may say it did.

Verification belongs to the run rather than the musician on purpose: a band can photograph a music stand on a residency and send nothing but the end-of-run record on a tour, and neither is a broken promise.

Publishing needs at least one method. A draft can sit unanswered.

Open, and not settled here: whether a patron should be able to say the record never arrived, the way the Phase 6 flag lets them say the run never happened. Today the flag covers both.
