# Door Money product contract

Effective 2026-09-18. Governed by decision 17 in `DECISIONS.md`.

## Purpose and exchange

Door Money connects sponsors with relevant audiences through music, sports teams, film, and theater. Organizers fund their work by offering specified visibility. Sponsors support work and communities that matter to them while receiving the exposure described in the purchased offer.

A fundraiser must answer: what will the money enable, who is the audience, and what visibility does the sponsor receive? Audience fit supports the purchase decision. Expected reach is an estimate with its basis stated; evidence of delivery and measured results are separate facts.

A sponsorship is not an investment, ownership stake, or promise of commercial return. A backing is the existing recognition contribution, a distinct transaction with its own benefits. Do not silently convert backings into sponsorships or advertise charitable tax treatment.

## Launch categories

These four stable keys are the contract for Phase 2. This document does not itself add database values or enable checkout.

| Key | Public name | Responsible organizer | Fundraiser scope | Relevant details | Example visibility |
| --- | --- | --- | --- | --- | --- |
| `music` | Music | Musician, band, ensemble, or music organization | A tour, residency, season, recording, or named music effort | Format, location, audience, and relevant performance or release dates | Instrument case, stage signage, program, website, or selected posts |
| `sports` | Sports teams | Team or authorized team representative | A season, tournament, travel, or equipment effort | Sport, team, location, season or event dates, and audience | Approved uniforms, venue signage, team materials, or digital channels |
| `film` | Film | Filmmaker or production organization | A named production, completion, or screening effort | Format, production stage, audience, and relevant production or release milestones | Agreed credits, screening materials, promotional channels, or specifically agreed product placement |
| `theater` | Theater | Theater company or authorized producer | A named production, performance season, or touring production | Production, venue or location, audience, and performance or production dates | Program, foyer signage, website, or agreed promotion |

Examples are possibilities, not included benefits or evidence requirements. An organizer may offer only placements they have authority to deliver. A film must not imply guaranteed distribution, festival acceptance, or audience size. A team representative must have authority over offered team inventory; youth participation does not create permission to publish identifying evidence about minors.

Category belongs to the fundraiser. It is separate from sale method, account role, music subtype, and timeline format. Category-specific fields may add context but must not fabricate a music subtype, show count, tour, or residency for another category. Even a music recording effort may have no performances.

Changing a category must not reinterpret a purchased offer. Phase 2 defines draft validation and locks; Phase 4 supplies purchase snapshots. Unknown or invalid new categories must fail validation rather than falling back silently to music. Existing music rows receive an explicit compatibility mapping.

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
- Add canonical discovery at `/fundraisers` in Phase 3. Keep `/auctions` compatible, update internal links deliberately, and reserve the new path in both namespace guards after checking for collisions.
- Keep existing `acts`, `runs`, `lots`, `patrons`, and `mark_*` names where changing them would break consumers. Neutral product language does not require wholesale table renaming.
- Existing `musician` roles must continue to sign in, retain ownership, and reach their dashboard when neutral account concepts arrive.
- Widgets must identify the intended fundraiser through rendering, payment creation, webhook fulfillment, return handling, and the final record. Never silently switch a new exact-fundraiser widget to another fundraiser. Existing profile-based snippets need a documented compatibility path.
- Preserve idempotency, amount validation, auction offer-version checks, authorization, private patron data, and read-only public views.

## Release policy boundary

Friday payouts and logo approval describe the existing music implementation. They do not establish a release policy for film, sports, or theater. Approval of sponsor materials and fulfillment of the purchased visibility are separate events.

Phase 4 must settle a policy matrix covering delivery timing, evidence access, release eligibility, missed deadlines, cancellation, partial delivery, refunds, and unresolved materials. Decision 16's unresolved-logo question remains open. Existing behavior stays intact until a reviewed implementation explicitly changes it.

Phase 3 verifies new-category publication and checkout in test mode. New-category live payments require the Phase 4 completion gate. A successful charge alone does not complete the product.

## Status and authority

Expansion Phase 1 establishes this contract and vocabulary checks. The current app remains music-specific. Phases 2–4 implement the contract; Phase 5 establishes operational evidence through real completed transactions.

This document and decision 17 take precedence over conflicting historical scope in `ROADMAP.md`, earlier decisions, and music mockups. Historical engineering audits remain evidence about their stated commits, not fresh assertions about current production.
