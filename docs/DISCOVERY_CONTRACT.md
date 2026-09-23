# The discovery contract

Built 2026-09-21 on `feat/richer-discovery-schema`, migration **0053**, applied to the hosted
project the same day and therefore frozen. This is the structured foundation sponsor discovery will
read. **No filtering or sorting is implemented here**, and the `/fundraisers` page is unchanged.

Applying it changed nothing anybody can see. Every column it adds is empty or derived-empty on
existing rows, nothing is required to publish, and no page reads the two views yet.

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

## The discovery page

Built 2026-09-22 on `feat/sponsor-discovery-filtering`, migration **0054**, applied to the hosted
project the same day and therefore frozen. `/fundraisers` is now a sponsor discovery surface: a
filter rail, a result count, removable filter chips, three sort orders and paginated cards.
`/auctions` and `/fundraiser` still redirect to it.

Applying 0054 changed nothing anybody can see. It replaces two read-only views with the same two
views plus a few columns, every one of which `anon` could already read on its own table. The page
that uses them merged the same day.

### The query, and what it reads

`findFundraisers` in `src/lib/discovery-query.ts` is **two reads, whatever the number of
fundraisers**, and it replaced `listOpenBoards` for this page. That loader asked for every
organizer and then a whole board for each: the fundraiser, its options, its public bids, its
buyers and its backers. A page of cards was being paid for with payment-adjacent history nobody
looks at, and the cost grew with the number of organizers.

1. `public_fundraiser_discovery`, narrowed on every fundraiser-level filter in the database and
   capped at `CANDIDATE_CAP` (200) rows.
2. `public_opportunity_discovery`, for those fundraisers' ids, in one `in (...)`.

A third small read, `discoveryCountries`, fills the country question with the codes that published
fundraisers actually record, so the page never offers a country nobody is in.

**Public fields the page reads.** From `public_fundraiser_discovery`: `id`, `slug`,
`organizer_slug`, `organizer_name`, `title`, `category_key`, `status`, `activity_mode`,
`activity_locations`, `activity_country_codes`, `discovery_tags`, `purpose`,
`audience_description`, `sponsor_promise`, `fundraising_starts_on`, `fundraising_ends_on`,
`bidding_closes_at`, `created_at`, `organizer_photo_url`. From `public_opportunity_discovery`:
`id`, `run_id`, `name`, `price_cents`, `mode`, `buy_now_cents`, `effective_closes_at`,
`placement_description`.

Migration 0054 added `organizer_name`, the three prose fields and `bidding_closes_at` to the
fundraiser view and `effective_closes_at` to the opportunity view. **It widened nothing**: every
one of those columns was already granted to `anon` on its own table. It put columns a visitor could
already read in one place so discovery is two queries rather than five.

Migration **0059** (2026-09-23, `feat/discovery-tiles-rows`, not yet applied to the hosted project)
appends one column to each view, again widening nothing:

- `organizer_photo_url` is `acts.photo_url`, in `anon`'s column list since 0022. It is the
  organizer's own image, modeled as such on the card (`organizerPhotoUrl`): it says who is raising,
  and no page may present it as documentation of the work or its delivery. The product holds no
  image of a fundraiser itself, so none is invented and nothing stands in for a missing one.
- `placement_description` is the offer contract's `placement.description`, read through
  `sponsor_facing_offer_terms` (0056), the projection every public reader of the terms goes through.
  One text column, trimmed, null where unwritten; never the document.

Both are read by the same two queries. There is no per-card read for either. The view's
`description` column (the template's `seen_by`) is deliberately not what a preview shows: a preview
names the option the organizer actually offers and, where they wrote it, where the sponsor appears.

The prose fields are **shown and never filtered on**, with one narrow, literal exception below (the
name search). Discovery narrows on the structured tags and nothing else; reading a filter out of a
description would claim a fact the organizer never stated.

### Query parameters

Shareable GET parameters, repeated rather than comma-joined, because that is what an HTML checkbox
produces and the page is a plain GET form. Refreshing or sharing a filtered address reproduces the
same page.

| Parameter | Repeats | Value | Filters on |
| --- | --- | --- | --- |
| `category` | yes | a `fundraiser_categories` key | `runs.category_key` |
| `mode` | yes | `online`, `in_person`, `hybrid` | `runs.activity_mode` |
| `country` | yes | a two-letter uppercase code | `runs.activity_country_codes` |
| `place` | no | free text | city, region or country in `runs.activity_locations` |
| `q` | no | free text, at most 80 characters | the fundraiser's title or the organizer's name, literally; see **Name search** |
| `purpose` | yes | a `discovery_tags` key | `runs.discovery_tags`, funding-purpose facet |
| `audience` | yes | a `discovery_tags` key | `runs.discovery_tags`, audience facet |
| `min`, `max` | no | whole US dollars | see **Price range** below |
| `sale` | yes | `fixed`, `bidding` | `lots.mode` (`bidding` is the stored `auction`) |
| `closing` | no | `soon` | see **Closing soon** below |
| `sort` | no | `relevant`, `newest`, `closing` | not a filter |
| `page` | no | 1-based | not a filter |

Within a group the values are alternatives; between groups they all have to hold. Music and Film
means either; Music and `travel` means both. Changing a filter returns to page one; paging keeps
every filter and the sort.

A malformed value is dropped rather than refused, so an address that has outlived a retired tag
still shows results. **A filter is never silently widened**: a discovery tag is checked for shape
only, not for registry membership, because the tag registry can come back empty and dropping the
tag would quietly return more than the sponsor asked for while the page still said it was
filtering. A key nothing carries narrows to nothing, which is the safe direction to be wrong in.

### Name search

`q` is a text lookup and nothing more: does the fundraiser's `title` or the organizer's `name`
contain these characters, ignoring case. It is the one filter that reads a text field, and it reads
only those two, which are names and not descriptions. It reads no `purpose`, `description`,
`audience_description` or `sponsor_promise`, and it infers nothing: "Brooklyn" in a title is not a
location filter, "jersey" is not a benefit, and "film" is not a category. The field that asks it
says "Search projects or organizers" and must not claim to search places, benefits or keywords.

The value is trimmed, its inner whitespace collapsed and it is cut at 80 characters
(`cleanNameQuery`). Every other character is matched as typed: `*`, `%`, `_`, a quotation mark, a
comma or a parenthesis is a character in a name, not an operator.

It is applied in both places every fundraiser-level filter is. In the database it is one PostgREST
`or` across the two columns (`nameSearchFilter`), applied **before the candidate cap**, so a name
that exists is found rather than cut off at 200. The value is double-quoted for PostgREST's own
grammar and the LIKE wildcards are escaped; `*` is the one character PostgREST turns into a
wildcard even inside quotes, so the database answer is a superset for a name containing one, and
`nameMatches` narrows it back to the literal match in TypeScript. Checked against a local
PostgREST on 2026-09-23. The no-database sample is filtered by the same function.

A bounded search is still bounded: with `q` set the cap applies to the fundraisers whose names
match, and the page says so when it is reached rather than presenting the list as complete.

Clearing the search removes `q` alone. Changing it, like changing any filter, returns to page one.
It survives sorting, paging and every chip, and repeated filter parameters stay repeated beside it.

### Discovery grain

The page lists fundraisers; price, sale method and closing soon are facts about a sponsorship
option. **A fundraiser is included when at least one currently available option matches all of the
offer-level filters together.** A $200 fixed-price option and a $9,000 bidding one do not make a
fundraiser a match for "bidding under $500". Only options with `status = 'open'` on an `open` or
`live` fundraiser are available at all, which is what the view already restricts; sold, pending,
unsold, cancelled and every draft's options are outside it.

### Price range

`min` and `max` are whole US dollars and are compared against **the organizer's own number, never a
template's suggested price**.

- A fixed-price option is matched on its price.
- A bidding option is matched on its reserve, which is where the bidding starts and therefore what
  a sponsor is deciding whether they can afford.
- Where a bidding option also carries a take-it-now price, **either** number falling inside the
  range is a match, because both are real numbers somebody could pay.

The card's prices are built from the matching options only, so a filtered card shows what the
sponsor actually asked about, and they are **kept apart by buying route**. Each matching option
carries its routes (`priceRoutes`): a fixed-price option's price; a bidding option's opening bid,
which is where the bidding starts and not a price anybody is promised to win at; and its
take-it-now number where the organizer set one. With a budget set, only the routes inside it count
(`routesWithinBudget`), and membership is exactly the rule above: an option matches when at least
one route fits. The card is then handed one span per route (`DiscoveryPricing`: `fixed`,
`openingBid`, `buyNow`) and the lowest number with the option it belongs to. A $150 opening bid
with a $500 take-it-now under a $200 budget therefore shows the opening bid and not the $500, and
never shows "$150" as a sponsorship price. A fixed price and an opening bid are never folded into
one unlabeled range.

Each card also carries up to three of its matching options as previews (`DiscoveryPreview`):
the option's own name, its sale method, its own numbers, its fitting routes and, where the
organizer wrote it, where the sponsor appears. A preview is always one of the options that
matched, never a template the organizer did not tick and never a more attractive option that did
not match, and a preview's price is that option's own. The fundraiser-level `sponsor_promise` is
carried separately (`sponsorPromise`) as the organizer's statement about the fundraiser; it is not
a claim that every option includes every part of it.

`matchingOffers` and `availableOffers` count sponsorship options, which is to say `lots` rows a
sponsor could buy now. Neither is a count of remaining spots, which discovery does not read, and no
page may call one the other.

### Closing soon

An available option closing within **seven calendar days**, and not already past.

The effective close is computed in the database as `effective_closes_at`, and it is
`lot_close_time`'s rule from migration 0035: the option's own `closes_at`, falling back to the
fundraiser's `bidding_closes_at` **for a bidding option only**. A fixed-price option is not on the
bidding clock and nothing in the product closes it on that date, so borrowing the number would put
a deadline on a page the organizer never set; it carries its own `closes_at` or none.

The fundraiser's activity end date is never used. It says when the work happens, not when an option
stops being available. A fundraiser is labelled closing soon only when at least one available
option is, and the card shows the actual closing time with its zone named.

### Most relevant

Deterministic, published, and checkable. Four comparisons in a fixed order:

1. how many available options match what the sponsor asked for
2. how completely the fundraiser answered the structured questions
3. how many available options it has at all
4. newest first, then by id so two identical rows never swap places

Completeness is a count out of six: a stated funding purpose, a stated audience, a stated sponsor
promise, an activity mode, at least one discovery tag, and at least one location or country. It is
not a quality score and nothing is ranked down for being small; it rewards a fundraiser a sponsor
can judge, which is the product's own test. None of it is required to publish, so a fundraiser with
none of it still appears, it simply sorts below one that answered.

**There is no personalization, no history, no model and nothing an organizer can buy.** A sponsor
who wants one plain answer instead can sort by newest (`created_at` descending) or by closing soon
(earliest matching close first, with fundraisers on no clock after those on one). The page says in
one line what most relevant does, above the results.

### When the database does not answer

`findFundraisers` reports where its answer came from (`status`): `live`, `sample` (no database is
configured and the built-in sample stood in) or `unavailable` (a database is configured and a
read failed, with `failedRead` saying which). Unavailable is its own state with no cards and a
total of zero, and the page says the list could not be read. It never says nothing is open, and
the sample never stands in for a database that is there and not answering. An offer read that
fails is unavailable too, not a page of fundraisers with zero options: unknown availability is not
zero availability.

### The bound

Relevance and closing soon both depend on a fundraiser's matching options, so the ranking cannot be
done by the database before the options are read. The query narrows on every fundraiser-level
filter first, takes at most `CANDIDATE_CAP` (200), reads their options in one further query, and
ranks what it has. Exact while a filtered set fits inside the cap; past it the page says so rather
than quietly cutting the list, and the ranking would have to move into SQL. `PAGE_SIZE` is 12.

### Known gaps

1. **City and region matching is not indexed.** `country` is a derived array column with a GIN
   index behind it; `place` is a case-insensitive substring over `activity_locations`, applied in
   TypeScript over the candidate set. A derived `activity_places` column, set by the same trigger
   as the country codes, is the symmetric fix when the volume justifies it.
2. **Price is filtered in TypeScript, not SQL.** The rule is an OR across `price_cents` and
   `buy_now_cents`, which is expressible in PostgREST but not readably, and the exact rule is worth
   more in one place than the push-down is. It runs over the capped candidate set.
3. **Every fundraiser-level filter is enforced twice**, once in the database and once in
   `fundraiserMatches`. That is deliberate: the fallback has no query to be filtered by, and a
   filter living in exactly one place stops applying the moment anything else calls the read model.
4. **Close times are shown in Eastern, labelled "ET".** That is the site-wide convention
   (`src/lib/dates.ts`) and it names its zone rather than implying the reader's own, but it is not
   yet city-agnostic. Changing it is a site-wide decision, not a discovery one.
5. **Most published fundraisers carry no discovery data yet.** Nothing in 0053 is required to
   publish, so the structured filters match only fundraisers whose organizers filled them in. The
   country question disappears entirely while no published fundraiser records an activity location,
   which is the case today.
6. **The no-database sample records none of the structured fields**, so with no Supabase connected
   the category, price, sale-method and closing filters work and the rest correctly match nothing.
   The page says so. A sample card is never evidence that anything persisted.

## Follow-up work for the sponsor discovery branch

1. ~~**The filtering UI.**~~ Built on `feat/sponsor-discovery-filtering`; see "The discovery page".
2. **Indexes for the queries that get written.** `runs.discovery_tags` and
   `runs.activity_country_codes` have GIN indexes, and the category and country filters use them.
   City and region matching has no index behind it; see "Known gaps".
3. **Whether the reach estimate belongs in the purchased-offer snapshot.** Today it does not:
   `purchased_offer_of` (0045) is untouched and does not read it, so the estimate is discovery
   metadata and not a term of sale. It follows that `freeze_lot_terms` does not freeze it, and an
   organizer can change it after a bid. If it should become part of what was sold, both change
   together. **The owner's call.**
4. **Delivery metadata on an offer.** Deliberately not added. `deliverables` (0045) already owns
   delivery timing, and a second place for a due date would create two answers to one question.
5. **Rendering the tags.** `/fundraisers` draws a fundraiser's discovery tags on its card, from
   the registry's labels, and follows the table above: absent renders as absent.
6. **A category added later needs discovery words too**, alongside `src/lib/categories.ts`,
   `src/lib/verification.ts` and its `surfaces` rows. A category with no scoped tags still gets
   every category-agnostic one, so this is a choice rather than a blocker.
7. **`Other` still cannot hold a sponsorship option**, so it has no offer-level discovery data.
   Unchanged by this branch, and noted in `CLAUDE.md` as not built.
