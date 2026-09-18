# Expansion Phase 2: foundation audit

Branch: `feat/expansion-02-foundation`. Started from merged Phase 1 at `0cd88f7`; refreshed against main `c4a3a03`. The intervening merge only updated remediation deployment documentation. This is expansion Phase 2, distinct from the older financial remediation phases.

## Model and behavior

- `fundraiser_categories` is an extensible registry, initially music, sports teams, film and theater. Owners read it; only trusted maintenance adds categories or their allowed detail keys. Adding a category does not make it publishable.
- Existing `acts` and `runs` retain their identity, ownership and URLs. A neutral organizer has no music type; old music profiles keep theirs. Legacy `musician` roles continue working; `organizer` is added atomically on ownership and can coexist with `patron`.
- Private drafts can omit a title, dates, music format and performance count. Unknown facts stay null (the legacy title column stores an empty string). Nonmusic drafts reject music-only fields. Category changes are refused after publication or attached offers, activity or backing history.
- Separate fields capture funding purpose, sponsor promise, audience, description, category details and the funding goal. The goal is integer cents and is not calculated from sponsorship inventory. Current supported goal currency is USD; this does not expand payment-country or currency support.
- Location is optional, with no NYC default. The model supports multiple activity locations, online/hybrid activity, region, country code and explicit time zone. Country codes are structurally validated as two uppercase letters, not checked against a country directory. Fundraising dates and activity dates are calendar dates; delivery and auction deadlines are absolute instants with offsets.
- The simple foundation form saves shared draft fields. Tailored detail editors, multi-location controls, delivery deadline controls, public profiles/discovery and exact-fundraiser widgets remain Phase 3. Stored structured details and delivery deadlines survive form saves.
- New categories remain private and cannot publish, including through direct service writes. Neutral profiles cannot enter the old music payment flow. Existing music forms keep the auction deadline, sponsorship editor and publishing controls once draft music details are complete.
- Existing public music profiles cannot be hidden by clearing their music type. Published fundraiser slugs and category history remain frozen even after returning to draft.

Every sponsorship still needs a concrete funding purpose and sponsor promise. This phase stores draft descriptions; it does not implement purchased-offer snapshots, evidence delivery or new payment policies.

## Audit fixes

Removed the New York fallback from the profile save action as well as the form and database default. Profile edits no longer attempt to write the protected `owner_id` column. Ownership adds organizer without a read/overwrite role race. Draft writes use the signed-in database client, derive ownership on the server, filter edits by owner and draft status, and report a zero-row update as failure.

Reviewed constraints, RLS, column grants, signup roles, save actions, public read models, published URL guards and legacy publication controls together. No authorization is based on a category or product-preference role.

## Verification

- Lint, TypeScript checks, unit tests and production build run locally. Unit tests exercise actual draft/profile actions with mocked session boundaries, plus category, currency, date, ownership and legacy-role validation.
- All migrations and the seed run on a scratch PostgreSQL-compatible PGlite instance. The existing seed was also loaded before the new migration and compared afterward: music IDs, slugs, ownership, types, dates and counts remained unchanged.
- The actual pgTAP SQL suites run locally with upstream pgTAP 1.3.4 SQL: 81 auction assertions, 114 permissions assertions and 32 expansion assertions. GitHub CI additionally runs native PostgreSQL and the repository's two-session concurrency gate.
- Clean dependency installation succeeds with the repository's pinned npm 11.6.2. npm 11.9 rejected the existing lockfile locally; dependencies and the lockfile are unchanged by this branch.
- Browser verification was attempted with agent-browser. Its daemon could not bind its socket in this environment (`Operation not permitted`). No authenticated browser, hosted Supabase or live payment flow has been certified. The temporary form-preview route was removed.

## Deployment and remaining review

The migration has **not** been applied to the hosted project. This PR does not merge or launch the new categories. Before release, apply the additive migration to a staging database, then deploy the app and exercise signup, organizer creation and save/reload for each category through the authenticated browser. Check an existing music profile, fundraiser URL, auction deadline and ownership boundary there too.

The application requires the migration: coordinate schema-first deployment. Once neutral profiles or incomplete drafts exist, reverting only to the old application is not a safe rollback because its music-only assumptions no longer hold. Prefer a forward fix or maintenance window; do not delete new drafts or force them into music placeholders to roll back.

Concurrent open work at the last audit: PR #27 (`/fundraisers` address and namespace reservation), #28 (README setup), #29 (dependency updates), and #30 (financial remediation Phase 4 inventory). They were not merged or modified by this phase. Reconcile them before Phase 3, particularly the discovery address and payment-policy inventory.
