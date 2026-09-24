# Door Money product contract

Effective 2026-09-18. Governed by decision 17 in `DECISIONS.md`. Starting set extended 2026-09-21 (Restaurants & hospitality, and Other) and 2026-09-24 (Digital workers).

## Purpose and exchange

Door Money connects sponsors with relevant audiences, starting with music, sports teams, film, theater, restaurants and hospitality, and digital workers, with Other for a project that fits none of them. Organizers fund their work by offering specified visibility. Sponsors support work and communities that matter to them while receiving the exposure described in the purchased offer.

**Confirmed product principle:** every sponsorship must make clear both what the funding enables and what the sponsor can count on receiving. This is the test for product fit across categories and places.

A fundraiser must answer: what will the money enable, who is the audience, and what visibility does the sponsor receive? Audience fit supports the purchase decision. Expected reach is an estimate with its basis stated; evidence of delivery and measured results are separate facts.

A sponsorship is not an investment, ownership stake, or promise of commercial return. A backing is the existing recognition contribution, a distinct transaction with its own benefits. Do not silently convert backings into sponsorships or advertise charitable tax treatment.

## Starting categories and expansion

These stable keys are the starting set, not the maximum scope of the product. The first four defined the initial cohort for Phase 2. `hospitality` and `other` joined on 2026-09-21; `digital_workers` joined on 2026-09-24. The intent is to expand to as many categories as can sustain a clear, deliverable sponsorship promise. This document does not itself add database values or enable checkout.

| Key | Public name | Responsible organizer | Fundraiser scope | Relevant details | Example visibility |
| --- | --- | --- | --- | --- | --- |
| `music` | Music | Musician, band, ensemble, or music organization | A tour, residency, season, recording, or named music effort | Format, location, audience, and relevant performance or release dates | Instrument case, stage signage, program, website, or selected posts |
| `sports` | Sports teams | Team or authorized team representative | A season, tournament, travel, or equipment effort | Sport, team, location, season or event dates, and audience | Approved uniforms, venue signage, team materials, or digital channels |
| `film` | Film | Filmmaker or production organization | A named production, completion, or screening effort | Format, production stage, audience, and relevant production or release milestones | Agreed credits, screening materials, promotional channels, or specifically agreed product placement |
| `theater` | Theater | Theater company or authorized producer | A named production, performance season, or touring production | Production, venue or location, audience, and performance or production dates | Program, foyer signage, website, or agreed promotion |
| `hospitality` | Restaurants & hospitality | Restaurant, bar, hospitality venue, caterer, or community kitchen | A dinner series, chef residency, guest experience, or community meal program | Kind of venue, program format, audience, and activity dates | Restaurant spaces, sponsored guest experiences, dinner series, chef residencies, or community meal programs |
| `digital_workers` | Digital workers | Independent worker with control over the offered channels | A named digital project, independent practice, or research and production effort | The work, actual audience, eligible accounts, calls or public page, and the agreed month | Monthly email signature, virtual meeting background or project page credit |
| `other` | Other | Organizer | A named project that fits none of the categories above | None of its own: the shared fields are the whole form | None suggested: the organizer states the placement |

**Availability is not the same for every row.** Music is published and takes payments. Sports teams, film, theater and Digital workers may publish, and take live payments only once their delivery policy is active. Digital workers has a proposed evidence policy and may be purchased in Stripe test mode only. Restaurants & hospitality and Other remain draft-only: an organizer can save a private draft, and nothing in those categories can be published or bought. Neither has a policy row.

Digital workers' three templates describe placement, not an impression count. A sender can document an eligible email signature, a worker can count eligible meetings without disclosing recipients or attendees, and a dated capture and URL can document a sponsor credit on a public project page the worker controls. Sponsorships must not assume the worker controls an employer's email, a client's meeting or a client's site. A page credit does not prove visits or clicks.

A sponsor cannot cancel a Digital workers engagement for a change of plans. If the worker fails to deliver the purchased placement, the sponsor may flag it for Door Money review; confirmed non-delivery returns the unreleased share and its fee. Flagging alone does not refund or reverse a completed release.

Digital workers have three editable project starters: an independent project, a digital product, and independent research. The first two suggest all three approved placement templates; the research starter suggests the email signature alone. All three set no price or reach, and create no sponsorship option until the worker chooses one.

Patrons can list Digital workers among the categories they support. That preference is descriptive; the separate publication switch and proposed delivery policy decide what a fundraiser may do.

The internal key for Restaurants & hospitality is `hospitality`. There is no `restaurants` key, and there must not be one: a second key would split the category's templates, words, and future delivery policy. A restaurant is one kind of hospitality organizer, not the only one.

Other is a controlled way in, not a way around the explanation. It has no templates, no suggested prices, no starter kits, and no fields of its own, so nothing describes the sponsorship except the organizer. A fundraiser in Other must still state what the funding enables, who it reaches, and what the sponsor receives, and it passes the same shared publication gate as every category when that gate is eventually opened for it. While it cannot publish, it is not offered as a sponsor preference.

Examples are possibilities, not included benefits or evidence requirements. An organizer may offer only placements they have authority to deliver. A film must not imply guaranteed distribution, festival acceptance, or audience size. A team representative must have authority over offered team inventory; youth participation does not create permission to publish identifying evidence about minors.

Category definitions must be extensible. Keep category labels, relevant fields, templates, and delivery-policy capabilities separate from shared ownership, checkout, and records. Adding a category should extend the defined category system through deliberate configuration and validation, without rebuilding the core workflow or forcing it into one of the named categories. Restaurants & hospitality arrived this way: registry rows, templates, and words, with no change to ownership, checkout, or records.

A future category fits when an organizer can state the funding purpose, identify the relevant audience, control the offered visibility, and specify what will be delivered and how it will be documented. Live availability also needs an implemented delivery and payment workflow. The initial taxonomy must not become a permanent product limit.

Category belongs to the fundraiser. It is separate from sale method, account role, music subtype, and timeline format. Category-specific fields may add context but must not fabricate a music subtype, show count, tour, or residency for another category. Even a music recording effort may have no performances.

Changing a category must not reinterpret a purchased offer. Phase 2 defines draft validation and locks; Phase 4 supplies purchase snapshots. Category keys not yet defined or enabled must fail validation rather than falling back silently to music. The enabled set must be able to grow; this validation rule does not close the product to future categories. Existing music rows receive an explicit compatibility mapping.

## Geography and audience reach

Category eligibility and geographic eligibility are separate questions. A category says what kind of work a fundraiser funds; it never says where. No category is tied to a city, including Restaurants & hospitality: a restaurant, a caterer, or a community kitchen anywhere may organize, and a program may be in person, online, or both.

Door Money is city-agnostic. NYC may supply more early testers through the founder's network, but that recruitment pattern does not define eligibility. The product is open in purpose to organizers and audiences anywhere a clear sponsorship promise can be delivered.

Separate the organizer's location, activity locations, and the audience the sponsorship reaches. Support local, multi-city, touring, international, and online-only activity without inventing an NYC address or a physical venue. Location informs discovery and audience fit; it is not a fixed city allowlist.

Phase 2 must support country-aware locations, optional city/region where appropriate, and explicit time-zone meaning for timed events and deadlines. Preserve date-only values as dates, and distinguish them from instants. Never silently interpret every organizer's deadline as New York time.

Geographic openness does not claim that every payment corridor or currency already works. Keep payment-country, currency, and payout capabilities explicit and separate from city eligibility. Preserve the current music payment behavior while designing those capabilities to expand; do not reinterpret existing integer money amounts in another currency or publish unsupported payment promises.

## Shared concepts and words

| Concept | Use | Boundary |
| --- | --- | --- |
| Organizer | The person or organization responsible for the fundraiser and delivery | Shared role language, with musician, team, filmmaker, or theater company when known |
| Sponsor | The person or business buying visibility | Based on transaction, not company size or whether payment has already happened |
| Patron | The broader relationship of support | Valid for existing accounts and the brand story; does not replace offer details |
| Backer / backing | Existing recognition contribution | Preserve its purchased benefits and separate payment history |
| Fundraiser | Named funding effort with category, purpose, goal, and timeline | Profile and fundraiser are distinct; one profile may have multiple fundraisers |
| Sponsorship option | Priced visibility offer | Fixed price and bidding are supported sale methods |
| Placement | Where the sponsor appears | May be physical, digital, print, or part of a production |
| Deliverable | Promised appearance or action, with scope and timing | A purchased commitment, not merely a template suggestion |
| Evidence | Documentation of fulfillment | Organizer-supplied unless a separate verified process exists |
| Record | Purchased offer, fulfillment, evidence, and payment outcomes | Distinct from Stripe's payment receipt |

Use fundraiser instead of board, campaign, or run as the shared product noun. Use the actual period where known. Use suggested prices for defaults. Plain category-specific language is welcome; the word musician is not retired. Patron profiles stay optional and private by default, with each activity independently published and anonymous activity still protected.

## Foundation requirements for Phase 2

A draft can save incomplete information, but fields provided must be valid. Publishing has a stricter, shared server-side gate, with category-specific additions. Draft and publish rules must not be accidentally identical.

Shared information includes category, title, purpose, description, organizer, location or relevant reach, audience description, funding goal in integer cents, and timeline. Unknown values remain absent, not zero or invented estimates. A funding goal is distinct from the sum of sponsorship inventory prices.

Fundraising dates, activity dates, and delivery deadlines have different meanings. Separate them where needed; never infer one from another. Existing music dates retain their current meaning. Exact column design and migrations are Phase 2 work, with explicit backfills, grants, validation, and rollback considerations.

Neutral account concepts must preserve ownership, combined organizing/patron behavior, and existing authorization. No migration may strand an existing musician or duplicate their fundraiser. Category selection must not grant access.

## Offer requirements for Phases 3 and 4

Before purchase, an offer must specify:

- Placement and format, quantity or appearances, size or prominence where relevant, and delivery window.
- Audience description and the basis for any estimated reach; unknown results must remain unknown.
- Price, inclusions, who pays production costs, and any explicit exclusivity scope.
- Sponsor materials and approval needs, with deadlines and a consequence for missing them.
- Deliverables, evidence commitments, evidence access, and completion criteria.
- Applicable release, cancellation, refund, and dispute terms.

Templates suggest structure; organizers make the commitments. Neither the template nor marketing copy may add unchosen proof requirements. Do not promise guaranteed sales, measured impressions where none exist, or platform certification.

Phase 4 captures an immutable purchased-offer snapshot, including the applicable policy version. Editing a template, organizer profile, fundraiser, or price must not rewrite a completed purchase. Evidence must be attached to the correct deliverable and viewed only by permitted parties. A public fundraiser does not make every evidence upload public.

## Compatibility contract

- Preserve existing music rows, IDs, ownership, purchased benefits, fee behavior, and historical payment records.
- Preserve `/<organizer-slug>` and `/<organizer-slug>/support-<fundraiser-slug>`. Published fundraiser slugs remain frozen; existing username and retired-address rules remain.
- Preserve `/board/<slug>`, `/mark/<id>`, record and claim links, and installed widget snippets.
- Canonical discovery is at `/fundraisers` (built 2026-09-21; `/auctions` redirects to it). The rule that got it there still holds for the next address that moves: keep `/auctions` compatible, update internal links deliberately, and reserve the new path in both namespace guards after checking for collisions.
- Keep existing `acts`, `runs`, `lots`, `patrons`, and `mark_*` names where changing them would break consumers. Neutral product language does not require wholesale table renaming.
- Existing `musician` roles must continue to sign in, retain ownership, and reach their dashboard when neutral account concepts arrive.
- Widgets must identify the intended fundraiser through rendering, payment creation, webhook fulfillment, return handling, and the final record. Never silently switch a new exact-fundraiser widget to another fundraiser. Existing profile-based snippets need a documented compatibility path.
- Preserve idempotency, amount validation, auction offer-version checks, authorization, private patron data, and read-only public views.

## Release policy boundary

Friday payouts and logo approval describe the existing music implementation. They do not establish a release policy for film, sports, theater, restaurants and hospitality, or Other. Approval of sponsor materials and fulfillment of the purchased visibility are separate events.

Phase 4 must settle a policy matrix covering delivery timing, evidence access, release eligibility, missed deadlines, cancellation, partial delivery, refunds, and unresolved materials. Decision 16's unresolved-logo question remains open. Existing behavior stays intact until a reviewed implementation explicitly changes it.

Phase 3 verifies new-category publication and checkout in test mode. New-category live payments require the Phase 4 completion gate. A successful charge alone does not complete the product.

## Status and authority

Expansion Phase 1 establishes this contract and vocabulary checks. The current app remains music-specific. Phases 2–4 implement support for the first four starting categories on an extensible, city-agnostic foundation; Restaurants & hospitality and Other sit on the same foundation as draft-only categories; Phase 5 establishes operational evidence through real completed transactions. Success in the initial cohort informs further category and geographic expansion rather than defining a permanent boundary.

This document and decision 17 take precedence over conflicting historical scope in `ROADMAP.md`, earlier decisions, and music mockups. Historical engineering audits remain evidence about their stated commits, not fresh assertions about current production.
