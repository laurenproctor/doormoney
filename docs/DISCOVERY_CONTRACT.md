# The discovery contract

Built 2026-09-21 on `feat/richer-discovery-schema`, migration **0053**. This is the structured
foundation sponsor discovery will read. **No filtering or sorting is implemented here**, and the
`/fundraisers` page is unchanged.

The problem it exists to solve: the only structured fact a fundraiser carried was its category.
Everything a sponsor would want to narrow by (what the money buys, who it reaches, where the
activity happens) was prose. Discovery had two options, and both were bad: guess filters out of
`purpose` and `audience_description`, which invents facts the organizer never stated, or offer no
filters at all. This adds a third: ask, store the answer as a key from a registry, and leave the
prose exactly as it is.

## The rule that governs all of it

**Structured fields supplement the free-text fields. They never replace them and are never derived
from them.** `purpose`, `description`, `audience_description` and `sponsor_promise` are unchanged,
are still what a sponsor reads, and are still what the publication gate tests. A tag is an extra
handle for finding the fundraiser, not a summary of it.

## Six distinctions the schema keeps

| This | is not this |
| --- | --- |
| A fundraiser's funding purpose (`runs.discovery_tags`, `funding_purpose` facet) | An individual sponsorship option (`lots`) |
| Activity location (`runs.activity_locations`, `runs.activity_country_codes`) | The organizer's own location (`acts.city`, `acts.region`, `acts.country_code`) |
| Audience reach (the `audience_type` facet, `lots.reach_estimate`) | Physical location (either of the two above) |
| A fixed price (`lots.price_cents` where `mode = 'fixed'`) | An auction reserve (`lots.price_cents` where `mode = 'auction'`) |
| The fundraising end date (`runs.fundraising_ends_on`) | A sponsorship option's closing time (`lots.closes_at`) |
| A template's suggested price (`surfaces.default_price_cents`) | The organizer's actual price (`lots.price_cents`) |

The fourth is one column read two ways, which is how it has always been; `mode` is what says which.
The fifth is two different columns that have never meant the same thing, and neither is
`runs.ends_on` (when the activity happens) or `runs.delivery_due_at` (when delivery is owed).

## The registry

Two tables, both reference data, both readable by anybody and writable by nobody but the service
role. A new facet is a row. A new tag is a row. **There is no union type in TypeScript for either**,
which is the rule migration 0038 set for categories.

### `discovery_facets`

| Column | Meaning |
| --- | --- |
| `key` | Stable key, the shape every registry key here has |
| `label`, `prompt` | The words the form uses |
| `on_fundraiser`, `on_template` | Which objects may carry a tag in this facet |
| `max_tags` | How many one object may carry in this facet. Choosing everything is not a filter |
| `sort` | Display order |

Two facets today: `funding_purpose` (fundraiser only) and `audience_type` (fundraiser and
template), both capped at five.

### `discovery_tags`

| Column | Meaning |
| --- | --- |
| `key`, `label`, `help` | The key stored, and the words for it |
| `facet_key` | Which question it answers |
| `category_keys` | The categories it is honestly about. **Null means every category** |
| `active` | False retires it: offered to nobody, removed from nothing |
| `sort` | Display order |

Nineteen tags today: ten funding purposes and nine audience types. Seventeen are category-agnostic,
because what a van costs and who is in the room are not music ideas. Two are scoped:
`matchday_crowd` to `sports` and `guests` to `hospitality`. A tag naming a category the registry
does not hold is refused (`guard_discovery_tag_categories`).

## Where the data lives

### Fundraiser level, on `runs`

| Field | Source | New? |
| --- | --- | --- |
| Category | `category_key` | 0038 |
| Activity mode | `activity_mode` (`in_person`, `online`, `hybrid`) | 0038 |
| Activity locations | `activity_locations` (jsonb: `city`, `region`, `country_code`) | 0038 |
| Country | `activity_country_codes` | **0053, derived** |
| Funding-purpose tags | `discovery_tags`, `funding_purpose` facet | **0053** |
| Audience-type tags | `discovery_tags`, `audience_type` facet | **0053** |
| Created at | `created_at` | 0001 |
| Fundraising window | `fundraising_starts_on`, `fundraising_ends_on` | 0038 |
| Public status | `status` (`draft`, `open`, `live`, `closed`, `cancelled`) | 0001 |

`activity_country_codes` is **derived, never handed in**: the trigger builds it from
`activity_locations`, normalized to uppercase, deduplicated and sorted. It is in no insert or update
grant, so it cannot disagree with the locations it came from. It is the activity's countries, which
is not the organizer's own country.

### Offer level, on `lots` and `surfaces`

| Field | Source | New? |
| --- | --- | --- |
| Offer name | `lots.label`, falling back to `surfaces.name` | 0001 |
| Offer description | `surfaces.seen_by` | 0001 |
| Price or reserve | `lots.price_cents`, with `lots.mode` saying which | 0001 |
| Fixed price vs bidding | `lots.mode` | 0001 |
| Buy-now price | `lots.buy_now_cents` (auctions only, above the reserve) | 0012 |
| Closing timestamp | `lots.closes_at` | 0011 |
| Offer status | `lots.status` | 0001 |
| Category compatibility | `surfaces.category_key`, enforced by `guard_lot_category` | 0040, 0044 |
| Audience type | `surfaces.discovery_tags` | **0053** |
| Expected reach | `lots.reach_estimate` + `lots.reach_basis` | **0053** |

**Why the audience tags sit on the template and not on the offer.** Who a placement reaches is a
fact about the placement: a touchline banner is seen by the people at the fixture whoever is
selling it. Putting it on `lots` would ask every organizer to restate the same fact and would let
two organizers disagree about one placement. So Door Money writes it once, per template, and no
organizer form asks. What is genuinely per offer is the organizer's own estimate of how many people
and why, which is the pair below.

**Why the reach estimate cannot exist alone.** The product contract says expected reach is an
estimate with its basis stated. `lots_reach_estimate_has_basis` refuses a number with no basis, the
save action says so in words first, and the form's own label asks "How do you know?". An estimate
with no basis is a claim, and the voice rules do not allow one.

## What is required, what is optional, and how missing information renders

**Nothing in this document is required for publication.** That is deliberate. Every fundraiser
published so far carries none of it, and a gate they would all fail on their next save is not a
gate. The publication gate is unchanged: music's own gate for music (format, both dates, a show
count), and the contract's three questions for every other category (what the funding enables, who
it reaches, what a sponsor receives), plus `publish_enabled` on the category.

| Field | Required? | Missing renders as |
| --- | --- | --- |
| Category | Yes, always. An unknown key fails validation and never falls back to music | n/a |
| Funding-purpose tags | No | Nothing. No "Uncategorized", no "Other" |
| Audience-type tags | No | Nothing |
| Activity mode | No | Nothing. Never guessed from whether a location exists |
| Activity locations | No | Nothing. Never an invented city |
| Country codes | Derived | Empty, which for online-only work is a fact and not a gap |
| Fundraising window | No | Nothing. Not substituted with the activity dates |
| Offer reach estimate | No | Nothing. Never `0`, never "unknown" |
| Offer buy-now price | No | Nothing |
| Offer closing time | Only where the fundraiser has options open to bids (existing rule) | Nothing |

This follows the standing rule for the domain components: **what is not known is not drawn**, and
no placeholder goes in its place. Discovery that filters on a tag shows fundraisers that carry it;
it must never show "no purpose given" as though that were a defect in the fundraiser.

## The two rules publication does add

1. **A public fundraiser that names a place says which country it is in.** A location with no
   country cannot be searched on, and half a fact on a public page is worse than none. Drafts may
   hold a partial location; publishing refuses one (`discovery_location_country`).
2. **An online fundraiser stays valid with no location at all.** No rule requires one, in any mode.
   The product contract makes location optional and forbids inventing a venue, so in-person and
   hybrid are not held to a location either. If that changes, it changes here and in the contract
   together.

Neither rule can affect a fundraiser published before 0053: `activity_locations` has defaulted to
`[]` on every row since 0038, and nothing has written it since.

## Validation, in both places

The database is the gate (`validate_discovery_tags`, called from `guard_fundraiser_foundation` and
`guard_template_discovery`). `discoveryTagErrors` in `src/lib/discovery.ts` says the same thing
first, in words, so the form can answer without a round trip.

| Refused | Error |
| --- | --- |
| A key not in the registry | `discovery_tag_unknown` |
| The same key twice | `discovery_tag_duplicate` |
| A blank key | `discovery_tag_empty` |
| A tag scoped to another category | `discovery_tag_category` |
| A facet that does not belong on this object | `discovery_tag_scope` |
| More than the facet's `max_tags` | `discovery_tag_too_many` |
| Newly choosing a retired tag | `discovery_tag_retired` |
| A location with no country, on a public fundraiser | `discovery_location_country` |
| A reach estimate with no basis | `lots_reach_estimate_has_basis` |

A country code is held to `^[A-Z]{2}$` in three places: the column check on `acts.country_code`
(0038), the location validator in the trigger, and `LocationInput` in
`src/lib/fundraiser-drafts.ts`. `activity_country_codes` is uppercased as it is derived.

**A retired tag stays on whatever already carries it.** `active = false` takes a tag off the list
for new choices and changes nothing already chosen, exactly as a retired template leaves its lots
alone (0044). The form still draws a retired tag that is already ticked, so it is never silently
dropped; unticking it is how it goes.

## The public surface

Two read-only views, and that is the whole of it. No table's `anon` grants were widened.

- **`public_fundraiser_discovery`** — published fundraisers (`open`, `live`, `closed`) with their
  structured facts and their organizer's slug.
- **`public_opportunity_discovery`** — sponsorship options a sponsor could buy now: `status = 'open'`
  options on an `open` or `live` fundraiser.

Both are `security_invoker = false`, so they select past row level security, and every write
privilege is revoked and never granted back (the rule migration 0030 set). Drafts are excluded by
status, not by a column list. Neither view carries a patron, a bid, an amount anybody paid, a fee,
a Stripe id, an evidence item or a delivery state: discovery and settlement stay apart.

`runs.discovery_tags` and `runs.activity_country_codes` are readable by `authenticated` and **not by
`anon`**; `activity_country_codes` is not writable by anyone, because the trigger writes it.
`lots.reach_estimate` and `lots.reach_basis` are readable by `anon` (the same visibility class as
`price_cents`, and RLS has kept a draft's options private since 0048) and writable only by
`authenticated`. `surfaces.discovery_tags` is public because `surfaces` has carried a blanket select
since 0001 and a template is public by design.

## Where the code is

| File | What it holds |
| --- | --- |
| `supabase/migrations/0053_discovery_contract.sql` | The registries, columns, validator, triggers, grants and views |
| `src/lib/discovery.ts` | Pure: registry types, the choices to offer, the validator's words, the read-model adapters |
| `src/lib/discovery-registry.ts` | Reads the two registry tables |
| `src/lib/domain.ts` | `DiscoveryTagView` and `DiscoveryFacetView` on `FundraiserView` and `OpportunityView`, all optional |
| `src/components/DiscoveryTagFields.tsx` | The organizer's checkboxes, drawn from the registry |
| `src/components/domain/OpportunityEditor.tsx` | The reach estimate and its basis |
| `src/app/actions/drafts.ts`, `src/app/actions/lots.ts` | Reading and saving both |

## Follow-up work for the sponsor discovery branch

1. **The filtering UI.** `/fundraisers` is untouched. The views exist for it; nothing reads them yet.
2. **Indexes for the queries that get written.** `runs.discovery_tags` and
   `runs.activity_country_codes` have GIN indexes. The views are unindexed views over indexed
   tables; whether that holds depends on the queries, which do not exist yet.
3. **Whether the reach estimate belongs in the purchased-offer snapshot.** Today it does not:
   `purchased_offer_of` (0045) is untouched and does not read it, so the estimate is discovery
   metadata and not a term of sale. It follows that `freeze_lot_terms` does not freeze it, and an
   organizer can change it after a bid. If it should become part of what was sold, both change
   together. **The owner's call.**
4. **Delivery metadata on an offer.** Deliberately not added. `deliverables` (0045) already owns
   delivery timing, and a second place for a due date would create two answers to one question.
5. **Rendering the tags.** No public page draws a discovery tag yet. When one does, it follows the
   table above: absent renders as absent.
6. **A category added later needs discovery words too**, alongside `src/lib/categories.ts`,
   `src/lib/verification.ts` and its `surfaces` rows. A category with no scoped tags still gets
   every category-agnostic one, so this is a choice rather than a blocker.
7. **`Other` still cannot hold a sponsorship option**, so it has no offer-level discovery data.
   Unchanged by this branch, and noted in `CLAUDE.md` as not built.
