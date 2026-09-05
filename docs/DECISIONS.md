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

**Decided (2026-09-04):** one word does both jobs. The username claimed at sign-up is the board address: whoever holds `gutter-hymns` signs in as that and their page is at `/gutter-hymns`. It lives on `profiles.username`, the board address stays on `acts.slug`, and two triggers in `0019_usernames.sql` keep the pair from drifting or from being claimed twice. `RESERVED_SLUGS` in `src/lib/slug.ts` is the one list guarding both, so it has to grow whenever a top-level route does.

The email link stays as a second way in, for accounts that never set a password. Forgotten passwords go through `/forgot`, which reports the same thing whether or not the account exists.

**Settled (2026-09-04):** changing the board address moves the username with it, and the pair is moved in one transaction rather than in two writes. Freezing one and letting the other drift would break the one-word promise, so neither drifts. What changed is that the word is no longer taken for good: see decision 12.

**Amended (2026-09-04):** the word is still claimed, but not at sign-up. Sign-up asks for a name, an email address and a password, and nothing else; the board address is claimed on the act page, where it is the same field as the board address and means something. Two reasons. A patron has no board and should never be asked to invent an address for one. And the sign-up page was explaining a mechanism ("one username, one password, the username is the board address too") to somebody who had not yet decided to be here. Sign-in still takes either the email address or the username, so nothing a musician already types has changed. See decision 10.

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

---

## 10. One account, either job, or both

**Blocks:** Phase 2 onwards, and the whole patron side

Door Money had one kind of account. A musician signed up, claimed a handle and got a dashboard. A patron who took a placement or backed a run was a row in `patrons` keyed by an email address, with nothing to sign in to and nowhere to see what they had backed. The record at the end of a run reached them by email or not at all, and a bid in progress was invisible between the confirmation and the outcome.

That split was never true to the market. The bassoonist who backs the band down the street is one person. So is the coffee roaster who plays Sundays at the same bar they sponsor.

**Decided (2026-09-04):** one account, carrying what it came here to do.

- `profiles.roles` holds `musician`, `patron`, or both (migration 0021). Sign-up asks the question in those words, "I play" and "I back musicians", and both can be ticked.
- A role is added by doing the thing and never taken away. Listing an act adds `musician`. Signing up with an address that has already paid for something picks that history up, through `claim_patron_rows`.
- What an account owns beats what it ticked: an account with an act lands on the board dashboard whether or not it ever called itself a musician.
- The Backed page at `/patron` shows placements, backings and bids, with how each bid ended. It reads with the service role after the session is proven, because `purchases`, `backings` and `bids` have never been open to the browser and this is not the reason to open them.

Sign-up and sign-in lost the nav and the footer at the same time. There is nothing on those pages but the way in and the reasons to want one: what the account is worth on the left, the form on the right.

Settled since, in decision 11: the public patron profile. `profiles.public_profile` was the placeholder for it and was never read; publication now lives on `patron_profiles.published`.

---

## 11. The public patron profile

**Blocks:** Phase 2, and the whole patron side

Decision 10 left one question open: a patron may want to show what they have put behind musicians, which is good for the musicians as much as for the patron. `profiles.public_profile` was a placeholder for it and nothing read it. What such a page shows, and whether an amount is ever on it, is what this settles.

**Decided (2026-09-04):** an optional page at `/patron/<username>`, private until the patron says otherwise, with no money on it anywhere.

Privacy is the governing rule, and it is held in three separate places rather than one:

- **Private by default.** A patron account needs no profile, a profile is unpublished when it is made, and an unpublished profile answers as though nobody is there. There is no page that says "private", because a page that says "private" says somebody is there. Publication is `patron_profiles.published`.
- **Per activity, one at a time.** Publishing the page publishes nothing that was on it already. Each placement and each backing is its own row in `patron_profile_items`, absent by default; ticking one says nothing about the next, and unticking one takes only that one down. A patron may publish a page with no activity on it at all, and the page says so without implying they have never given anything.
- **Never an amount.** Not on the page, not in the payload behind it, not in the control that publishes an item. The two public views (`public_patron_profiles`, `public_patron_activity`) carry no amount column to leak, and no email address, payment status, Stripe id, mark, record link or account id either. `profiles` is never opened to the browser, because it holds email addresses.

What is on it: a photograph, a display name, the username, up to 240 characters of bio, an optional city or region, an optional https link, up to eight music preferences in the patron's own words, the year they started, and whichever placements and backings they published. What each of those says is the musician, the run, the kind of support and the month. Totals are counted from that public activity alone: "3 runs backed", "2 musicians supported".

**Anonymity is not reversible here.** A spot won through a bid the patron asked to keep anonymous is not offered for publication and is refused again by the public view, whatever a form says. Decision 7 made anonymity a promise on the board; publishing a profile does not take it back. Reversing an anonymous transaction on the patron's say-so is a bigger question than this page, and the safe answer for now is that it cannot be done at all.

Photographs sit in a private Storage bucket and reach the page as short-lived signed links, so hiding a profile hides its photograph within the hour rather than leaving a permanent public URL behind.

Open, and not settled here: whether a musician should be able to see which patrons published a placement on their run, and whether a board should link back to a patron page. Nothing does today.

---

## 12. How often a username may move

**Blocks:** decision 8, decision 11

Decision 8 gave every account one word doing two jobs: the sign-in handle and the board address. It said nothing about changing it, and the copy around it read as though the word were taken for good. That was fine while only musicians had one. A patron's username is the address of a page about them, and a name somebody picked in a hurry should not be theirs for life.

Letting it move freely is the other extreme: every board link, every printed sticker and every share of a patron page would rot, and a word given up in the morning could be taken by a stranger in the afternoon and inherit the traffic.

**Decided (2026-09-04):** once every twelve calendar months, and the word left behind is never reissued.

- Claiming a word starts the clock. `profiles.username_set_at` records it, so the next date is calculable rather than remembered, and it is shown before anybody tries.
- Twelve **calendar** months, not 365 days: a word claimed on 29 February moves on 28 February.
- The rule is held by `claim_username` in migration 0024, not by the form. It takes an advisory lock on the word, so two accounts racing for one cannot both win; the loser is told it is taken.
- Every retired word goes to `username_history` and stays there. Nobody else can claim it, and `/patron/<old>` and `/<old>` redirect permanently to the current address.
- An account with an act moves its handle and its board address in the same transaction, so the one-word promise from decision 8 holds through the change. The patron is told both addresses will move before it happens.

Twelve months is a judgement, not a calculation. It is long enough that links are worth writing down and short enough that a bad first choice is not a life sentence.

---

## 13. Where an act and a run live

**Blocks:** nothing. Built 2026-09-04.

A board used to be one page per act, at `/board/<act>`. That made "act" and "board" the same thing, so an act could only ever be raising for one run, and a musician had nowhere to say who they are apart from whatever run happened to be open.

**Decided (2026-09-04):** the act gets a page, and each run hangs off it.

- `/gutter-hymns` is the act's page: who they are, what they are raising for now, and what they have already run. It is the address a musician gives out and the one on the dashboard.
- `/gutter-hymns/support-europe-tour` is one run's board. The musician names the fundraiser ("Europe Tour"); Door Money slugifies it into `runs.slug` and puts `support-` in front when it builds the path. The word is theirs, the prefix is ours, so every run address says what it is for.
- `runs.slug` is unique inside the act, not across the site: two acts may both run a `fall-tour`.
- A draft's address follows its name. Once the run is published the address is frozen, because by then it is a link on a poster and runs have no history table to redirect from the way a moved handle does. The trigger in migration 0025 holds this, not the form.
- `/board/<act>` redirects permanently to whichever run the act is raising for, and to the act's page when none is open. It is in sent emails, in pasted widget snippets and in Google, so it stays forever.
- Every public address is built in `src/lib/urls.ts`. Act words now sit at the root of the site, so `RESERVED_SLUGS` is what keeps a musician off `/login`, and it has to grow whenever a top-level route does.

The cost is that the root of the site is a catch-all: anything the static routes do not claim reaches the act page. That is why the moved-handle lookup answers null rather than throwing when it cannot answer, and why the reserved list is tested against the database's own copy.

---

## 14. The words the site uses

**Blocks:** all copy from here on.

The vocabulary was written from the inside. It is coherent, and it is doing real work: "musician" instead of creator, patronage instead of advertising, a refusal to sound like an ad network. But it also asks a stranger to learn six words before the offer makes sense. Someone meeting a fundraiser for the first time hits "board", "run", "placement", "surface" and "mark" inside two screens, and not one of them means in English what it means here.

The two audiences who have to convert cold, a local business owner who has never sponsored anything and a fan, are exactly the two with no way to decode any of it. Counted in the rendered text of the marketing pages: "board" appears 73 times, "placement" 57, "patron" 40.

**Decided (2026-09-04):** two classes of word, governed differently.

**Identity words carry the company and do not change.** Musician, patron, backing, Door Money, "put money behind the music". These are the reason the site does not read like a media buy, and they are worth defending.

**Mechanism words are labels for how the machine works.** They should be whatever a stranger would say. Where a plain word exists the plain word wins, even when the insider word is more precise.

The mapping:

- board becomes **fundraiser**
- run becomes the actual period (**tour**, **residency**, **season**) where it is known, otherwise **fundraiser**
- mark becomes **logo**, or **name and logo**
- surface becomes **where the sponsorship appears**, or just the thing itself (a kick drum head)
- standard card becomes **suggested prices**
- "the act" in prose becomes **the musician** or **the band**
- placement is kept but narrowed: only the place a sponsor appears, never the thing being bought
- lot is unchanged, and stays in the database where it already lives

**Sponsor and patron both stay, and divide by the kind of transaction.** They were never synonyms, and treating them as rivals is what made this look like a choice.

- **Patron** is the umbrella. Anyone on the paying side is a patron, at any stage: before the money, after it, fan or business. It is what the `patrons` table holds, what `/patron` is, and it is the company's whole thesis.
- **Sponsor** is a patron whose money buys a sponsorship, which in practice means a business or a brand taking a placement. Use it wherever the subject is that transaction: the sponsorship pages, the sponsorship options, the approval flow. It is also the word a business owner would search for and use with their bookkeeper.
- **Backer** is a patron whose money is a backing, the fan tier through the widget. A backing is not a sponsorship, so a fan was never a sponsor.
- The test: name the transaction and the noun follows. If nothing in the sentence is a sponsorship, the person is a patron.

This keeps `/patron/<username>`, the `patrons` table, `profiles.roles` and decision 10 exactly as they are.

**Amended (2026-09-04):** this rule first split the two words by tense, sponsor before the money and patron after. Building the sign-up page showed that was the wrong axis. It had no word at all for a fan at the invitation stage, and it forced "sponsor" onto somebody putting $25 into a backing, which this same decision says is not a sponsorship. The kind of transaction is what the two words were always tracking; the tense was a proxy for it that broke as soon as a page had to address both sides at once.

**Addresses outlive words.** Routes and columns keep their names even where the copy changes. `/mark/<id>` is in receipts already sent, `/auctions` is in sent email, and `/board/<act>` is on printed stickers (decision 13). Change what a page says, not where it lives. `/placements` was the one exception, renamed to `/how-sponsorship-works` while nothing was public yet.

So these are not renamed, and never by a repo-wide replace: `runs`, `lots`, `acts`, `patrons`, `mark_text`, `mark_status`, the `Surface` type in `src/lib/catalog.ts`, and the word "mark" in `src/components/Logo.tsx`, where it means the wordmark and nothing else.

**Applied page by page, not all at once.** `/how-sponsorship-works` is written in the new vocabulary; every other page still carries the old one. A session that touches a page converts that page and leaves the rest alone. `src/lib/email.ts` holds more of the old vocabulary than any other single file and reaches people who have already paid, so it is the first target after the marketing pages.

**Settled since (2026-09-04):**

- The browse page is **Fundraisers**. The route stays `/auctions`, because that address is already in sent email and in pasted widget snippets, and decision 13 settled that an address outlives the words on the page. Not everything on it is an auction, and the copy no longer implies it is: each sponsorship is fixed price or open to bids, and the musician decides which.
- **"Widget" leaves the site nav** and moves into the musician's dashboard as "On your site". The page is worth nothing to somebody without a fundraiser to embed, and the snippet itself was already on the dashboard overview. `/widget` is unchanged.

**Still open**, and deliberately not settled here, because it is a conversion question rather than a copy one:

- Whether "List an act" survives as the primary musician call to action. It is clear enough, and it is on every page.

The cost is a stretch of time where the site says two things at once. That is the price of not doing a big-bang rewrite across every page and every email, and it is smaller than the cost of a stranger bouncing off "board" on the way in.

---

## 15. Who the copy talks to

**Blocks:** all copy from here on.

The voice rules have banned the second person since the first copy brief, and on the pages that brief was written for the ban is right. Door Money serves musicians and the people funding them, usually on the same page, and the third person is what forces a sentence to name which one it means. "Musicians open a fundraiser, sponsors keep a record of what they backed" is one clear line in the third person and two confusing ones in the second, because "you" would be a different person in each half.

The trouble is that the rule was written as an absolute and applied everywhere, and it has been collecting exceptions ever since: the tagline's second line (decision 1), the sponsor steps on the home page, List an act, the widget. Four carve-outs is not a law. It is a default that was never scoped.

Where it actually breaks is a form. On the sign-up page the reader has already picked a side, is acting on their own account, and is about to agree to the terms. "Musicians agree to the Terms and Conditions", under a button somebody is about to press, does not say who is agreeing. Plain-language guidance recommends the second person for instructions and tasks on comprehension grounds rather than fashion, and consent is the case where naming the person matters most.

**Decided (2026-09-04):** the rule is scoped rather than relaxed, and the thing it is really about is ambiguity, not formality. The second person is banned wherever "you" could mean either side of the market, and used wherever it cannot.

- **Editorial surfaces stay in the third person.** Home, how sponsorship works, the live fundraisers index, an act's page, a fundraiser's page, the legal pages. These describe the market to somebody deciding whether to enter it, both sides read them, and the copy has to keep saying which side it means.
- **Transactional surfaces are written in the second person.** Sign up, sign in, the password flows, the dashboard, the patron pages behind an account, form labels, helper text, validation messages, the record, and every email that reaches somebody about their own money. One reader, already self-selected, doing something to their own account. There is no ambiguity about who "you" is, and writing around it makes the instruction worse.
- **A marketing page that addresses one audience only may use either.** List an act and the widget speak to musicians and nobody else, so the ambiguity the rule exists to prevent cannot arise. Both are in the second person today and stay there.
- The line is whether the reader has an account and is doing something to it, not whether the page happens to contain a form. The newsletter box on a marketing page is still marketing.
- **Button labels are imperative or nominal everywhere**, on both kinds of page: "List an act", "Back a musician", "Create free account". An imperative is not the second person for this purpose and it reads the same in both registers.
- The exceptions named in the old rule are absorbed by this one and no longer need listing, except the tagline's second line, which stays an exception because it is marketing and it does say "you" (decision 1).

The cost is that the site reads in two registers, and the seam shows when somebody moves from a fundraiser page to the sign-up form. That is the right place for a seam. It falls between reading about a market and using a product, which is a difference readers already expect, and the alternative was a consent line that never says who is consenting.
