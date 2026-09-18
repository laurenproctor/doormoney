# Five-phase sponsorship expansion

Baseline audited: `main` at `6bb4ababc67bafa866f5a93704327d6ae21a9a36` on 2026-09-18. No open pull requests were returned, and branch discovery returned only main before the expansion branch was created. This does not establish that no other developer has local work.

This is the expansion sequence. The original music roadmap and financial remediation plan use their own phase numbers. Always prefix expansion work with "expansion" to distinguish it.

## Working agreement

One phase, one isolated branch, one reviewable pull request. Re-audit main and open work before starting each phase. Use a fresh checkout or worktree and never reset, stash, clean, or overwrite someone else's work.

Start each new phase from the accepted, merged predecessor on current main. If main advances, compare the intervening diff, resolve actual overlaps on the phase branch, and recheck affected behavior. Do not force-push or merge automatically. Report the commit tested, files changed, checks run, limitations, and the completion gate.

Review the product behavior together at the end of each phase. Implementation completion, merge, production migration, and live launch are separate statuses. A draft PR is reviewable work, not a deployment.

## Phases and evidence

| Phase | Branch | Scope | Completion evidence |
| --- | --- | --- | --- |
| 1. Product contract | `feat/expansion-01-product-contract` | Instructions, decisions, category definitions, terminology, vocabulary tests | Active instructions consistently describe the broader product; historical music rules are explicitly scoped; targeted vocabulary tests pass |
| 2. Foundation | `feat/expansion-02-foundation` | Categories, neutral accounts, fundraiser details, goals, timelines, additive migrations | All four categories save and reload valid drafts without invented music fields; invalid input is rejected; existing music ownership, data, and URLs survive |
| 3. Creation and discovery | `feat/expansion-03-creation-discovery` | Category-aware forms, profiles, sponsorship templates, discovery, dashboard language, exact-fundraiser widgets | Each category publishes and receives a test payment on the intended fundraiser; redirects, direct links, and two-fundraiser widget cases are checked |
| 4. Delivery and payment policies | `feat/expansion-04-delivery-policies` | Purchased-offer snapshots, deliverables, evidence permissions, releases, cancellations, records | Every launch category completes payment through delivery and release or refund; retries and exceptions preserve the purchased promise and financial totals |
| 5. Pilot and refine | `feat/expansion-05-pilot-refinements` | Cohort setup, observed funnel and delivery issues, scoped fixes, operating record | Completed real transactions across all four categories, measured support effort, and an explicit expansion decision |

Phase 3's test-mode qualification is deliberate: the Phase 4 workflow must exist before new categories take live money.

## Phase 1 baseline findings

This is a product-contract audit, with targeted implementation reads. It is not a full security, production, or financial certification.

| Finding | Evidence at the baseline | Required phase |
| --- | --- | --- |
| Product instructions explicitly restrict the marketplace to working musicians in New York | `CLAUDE.md`, README, decisions 1 and 14 | 1 |
| Creation requires tour/season/residency and at least one show, even for a draft | `src/app/actions/run.ts`, `src/components/RunForm.tsx` | 2, then category-aware UI in 3 |
| Publishing requires a show count rather than category-specific completeness | `src/lib/readiness.ts` | 2–3 |
| Accounts and dashboard labels assume a musician | `src/lib/roles.ts` | 2–3 |
| The catalog supports touring band, house act, and soloist; widget tiers promise music recognition | `src/lib/catalog.ts` | 3 |
| Unknown periods fall back to tour wording | `src/lib/periods.ts` | 2–3 |
| Embed rendering selects by profile slug and return handling checks act slug rather than a fundraiser ID | `src/app/embed/[slug]/page.tsx` | 3, with checkout/webhook audit |
| A widget's displayed goal derives from asking prices | `boardAsking` usage in `src/app/embed/[slug]/page.tsx` | 2–3 |
| Releases use weekly slices and gate sponsorships on logo approval | `src/lib/release.ts`; decision 16 leaves unresolved materials open | 4 |
| Vocabulary tests pass while single-word labels such as "Run name" remain | `tests/vocabulary.test.ts`, `src/components/RunForm.tsx` | 3 manual copy review and improved coverage |
| Historical financial audits already identify further work | `docs/SYSTEM_INVARIANTS.md`, `docs/REMEDIATION_PLAN.md` | Re-audit before 4; do not assume old findings are resolved or unchanged |

## Phase 2 audit checklist

Trace database constraints, role assignment, ownership, save actions, read models, defaults, and publication guards together. Inspect current migrations and grants before designing an additive migration. Test minimal drafts, save/reload, invalid categories, missing fields, partial dates, category changes, and another account attempting edits.

Use existing music fixtures to establish compatibility before changing the model. Check profile and fundraiser addresses as well as sign-in destinations. Distinguish fundraising goals from available inventory value and fundraising windows from activity/delivery dates.

## Phase 3 audit checklist

For each category, trace form to saved draft, preview, published page, discovery result, offer, checkout, webhook fulfillment, and record link. Check old music routes and emails. Use two fundraisers under one profile to prove a widget cannot redirect money to the wrong fundraiser, including return from a redirect-based payment method.

Audit shared copy and category-specific nouns manually as well as with tests. Add `/fundraisers` only after checking root namespace collisions and database reservations. Do not treat sample-data rendering as proof of real persistence or payment routing.

## Phase 4 audit checklist

First settle the policy matrix with the owner, then implement its complete state transitions. Trace paid, awaiting materials, approved, awaiting delivery, evidence submitted, completed, cancelled, disputed, refunded, and released states where applicable. Document which transitions are automatic and which need a human decision.

Verify purchase snapshots cannot be rewritten by later edits; private evidence cannot leak; a failed or retried webhook cannot double-charge or double-release; cancellation after partial release follows disclosed terms; and records match the actual ledger and Stripe state.

Re-audit the existing financial remediation backlog. A vocabulary change cannot resolve financial integrity issues. Category-specific live payment readiness depends on both the product workflow and the underlying money controls.

## Phase 5 pilot

Recruit a small, explicitly tracked cohort covering all four categories. Recruitment and sponsor outreach require actual participants; this phase cannot be completed with generated examples.

Record setup time and abandonment, offer views and purchases, completed and late deliverables, evidence acceptance, release/refund outcomes, support minutes per transaction, and manual exceptions. Keep denominator and cohort dates alongside every conversion figure.

Agree numeric success thresholds before recruiting, based on pilot size and economics; none are implied by this contract. Decide whether to expand, revise, or narrow categories from completed transactions and operating effort. A paid but undelivered sponsorship is not a successful pilot outcome.
