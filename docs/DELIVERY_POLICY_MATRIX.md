# Delivery and release policy matrix

Drafted 2026-09-20 on `feat/transition-06-category-delivery-policy`, from `origin/main` at `9207650`. This is the matrix `PRODUCT_CONTRACT.md` ("Release policy boundary") and decision 17 say has to exist before any category but music takes real money.

Every cell below is one of three things, and says which:

- **Today.** What the code does now, with the file that does it. Not a proposal.
- **Decided.** Settled by a numbered decision in `DECISIONS.md`.
- **Proposed.** A default written here so the build can proceed in test mode. Not settled. Nothing proposed here moves real money: every category but music is refused a live payment until its policy is marked active by the owner (`src/lib/delivery-policy.ts`, and the policy row's own status).

Decisions 16, 17 and 19 reserve several of these for the owner and say not to default them in code. They are collected under "Owner decisions" at the end, each with a recommendation, and none of them is defaulted for music.

## 1. Music, as it is today (policy `music` version 1)

Version 1 of the music policy is a description of current behavior, word for word. It changes nothing. Its purpose is that every existing and future music purchase can say which rules it was bought under, so that a later version 2 cannot rewrite them.

| | Sponsorship (a lot) | Backing (a widget tier) |
| --- | --- | --- |
| Sponsor materials | A name or logo, `purchases.mark_text` and `mark_url`. One reminder three days after paying (`sendMarkReminders`, migration 0018). **Today.** | None. The fan's display name is taken at checkout. **Today.** |
| Approval | The musician approves or declines the logo (`decideMark`). **Today.** | None. |
| Delivery timing | Across the fundraiser's dates, `runs.starts_on` to `ends_on`. **Today.** | Same dates. |
| Evidence type | What the musician ticked on the fundraiser from `src/lib/verification.ts`: selected-show photos, venue and date record, post links, attendance estimates, the end-of-run record, or their own words. **Decided, 9.** | Same record. |
| Evidence visibility | Show photos sit in a public bucket and appear on `/record/<id>`, which is unlisted (`noindex`) and open to anyone holding the link. **Today.** | Same. |
| Evidence retention | Not defined anywhere. Nothing is ever deleted. **Today.** | Same. |
| Release eligibility | Equal Friday slices across the dates (`weeklySlices`). A slice moves only when the charge is held, the logo is approved (`slicePlan`, and the trigger in migration 0031) and payout setup is finished. **Decided, 2 and 16.** | Calendar only: no logo gate. **Decided, 2 and 3.** |
| Missed deadlines | None exist. A slice held for an unapproved logo keeps its date and pays late, never less. **Today.** | None. |
| Partial delivery | No concept. A patron flag (`src/lib/flags.ts`) pauses the unreleased slices of that one placement while Door Money looks. **Today.** | Same flag. |
| Make-goods | None. **Today.** | None. |
| Organizer cancellation | `cancelRun`: every unreleased slice is refunded to every patron, fee included on that share (`refundDue`), and the remaining slices are skipped. Released slices stay released. **Today.** | Same. |
| Sponsor cancellation | Not offered. A sponsor's only lever is the flag. **Today.** | Same. |
| Refunds | Declined logo: the whole charge, because no slice can have moved. Cancellation: the unreleased share. A refund made by hand in Stripe is mirrored by `charge.refunded`. Written to the outbox before Stripe is called (migration 0032). **Today.** | Cancellation and by-hand refunds only. |
| Disputes | Policy: Door Money never reverses a transfer automatically, recovers from later slices, and absorbs the rest. **Decided, 18.** Nothing in the code handles `charge.dispute.*` yet: it is remediation Phase 4. **Today.** | Same. |
| Unresolved sponsor materials | The money stays held, visibly, with no Friday that will move it. **Open, decision 16.** | Not applicable. |
| Missed funding goal | No effect. A sponsorship is a direct purchase and is kept whatever the fundraiser raises. `runs.goal_cents` is display only. **Today.** | Same. |

Decision 19 (the last slice waits for the evidence the organizer chose) is decided and not built. It is sequenced after remediation Phase 4 and is not part of version 1.

## 2. What happens to a sports, film or theater purchase today

Found while writing this, and the reason the matrix cannot be "the music rules, renamed". These categories can publish and can be paid in test mode (migration 0041). A test purchase then goes wrong in two ways:

1. **The schedule is nonsense.** `holdPurchase` calls `weeklySlices(net, new Date(run.starts_on), new Date(run.ends_on))`. Outside music both dates are null (migration 0038 forbids inventing them), `new Date(null)` is 1 January 1970, and the whole net becomes one slice due in 1970.
2. **It then waits for a logo forever.** Migration 0031 holds a sponsorship's slices until `mark_status = 'approved'`. A program credit, a curtain speech and an agreed product placement have no logo. Nobody is ever asked for one, so the money never moves. If somebody did approve one, the entire amount would leave on the next Friday, before anything was delivered.

So the logo is, today, the universal definition of "the sponsor's materials are in" and of "this may be paid". That is the thing this work removes.

## 3. Sports, film and theater (policy version 1 of each, **proposed**, test mode only)

One shared shape, with the three cells that genuinely differ by opportunity type broken out in section 4.

| | Proposed policy |
| --- | --- |
| Sponsor materials | Whatever the opportunity type needs: artwork, a credit line as it should read, a product, or nothing. Listed per type in section 4. Due 14 days after payment unless the organizer sets another date on the opportunity. |
| Approval | The organizer accepts or declines the materials, once. Accepting says "I can deliver this", nothing more. It is not delivery, and it releases nothing. |
| Delivery timing | By the fundraiser's `delivery_due_at` where it has one, otherwise by the end of its activity window. Each deliverable carries its own due date, copied into the purchase snapshot at the moment of purchase. |
| Evidence type | Per type, section 4. Always organizer-supplied. Door Money checks that it exists, never whether it is good (decision 19, point 1; voice rule 6). |
| Evidence visibility | **Private by default**: the sponsor who bought it, the organizer, and Door Money. The organizer may publish one item at a time, and never an item marked as showing a minor. A public fundraiser publishes nothing. |
| Evidence retention | Kept for the life of the record. The sponsor's copy of the record keeps its evidence. Deleting an item is Door Money's act, on request, and leaves a tombstone saying an item was removed. |
| Release eligibility | The organizer's share is released when every deliverable on the purchase has evidence attached and the materials were accepted. Nothing moves on a calendar. Released in one transfer per purchase, on the next Friday, through the same job and the same idempotency key as today. |
| Missed deadlines | A deliverable past its due date with no evidence is marked late. Door Money writes to both sides. Money stays held. No automatic refund and no automatic release. |
| Partial delivery | Release follows delivered deliverables pro rata: two of three program runs delivered releases two thirds. The rest stays held until delivered or refunded. |
| Make-goods | The organizer may offer a replacement deliverable. It becomes a new deliverable on the same purchase only if the sponsor accepts it in writing. The original snapshot is never edited. |
| Organizer cancellation | As music: every unreleased cent goes back, fee included on that share. |
| Sponsor cancellation | Before materials are accepted: full refund. After: not offered, as with music, because production may have started. The flag remains. |
| Refunds | `refundDue`, unchanged. With nothing released, that is the whole charge. |
| Disputes | Decision 18, unchanged, for every category. |
| Unresolved sponsor materials | Follows whatever the owner decides for decision 16, so that music and everything else have one answer. Until then: held, and visible on `/admin`. |
| Missed funding goal | No effect on a purchased opportunity, as with music, unless the opportunity itself says it depends on the goal. That condition would be written on the opportunity and copied into the snapshot. None of the launch templates has one. |

## 4. By opportunity type

Templates are grouped by what the sponsor has to hand over, because that, not the category, is what decides materials, approval and evidence.

| Type | Templates | Sponsor materials | Approval | Evidence |
| --- | --- | --- | --- | --- |
| Logo or artwork on something physical | music: kick head, cases, straps, amp grilles, riser, tip jar card, merch runner, hang tags, picks, case lid, music stand. sports: jersey front, warm-up tops, touchline banner. film: screening signage. theater: foyer signage | Artwork file | Organizer. Sports also confirms league and kit-supplier rules before accepting | A photograph of it in place |
| Printed credit | music: poster credit, recital program credit. sports: team sheet. film: screening program. theater: program credit | The credit line as it should read, optional logo | Organizer | A photograph or scan of the printed piece |
| Screen credit | film: end credit, special thanks | The credit line as it should read | Organizer, before picture lock | A frame or clip of the credit. Due at completion, which may be long after payment |
| Spoken mention | music: stage thank-you. theater: curtain speech | The name as it should be said. No logo exists | Organizer words it | The date and place of each mention, in the organizer's own record. No recording is asked for |
| Product in the work | film: agreed product placement. theater: agreed set dressing | The product itself, and what may and may not be shown | Organizer and director or designer, scene by scene | A still of the scene or the set |
| Online | music: posts and email, vlog card, rig rundown, practice videos. sports: fixture posts. film: release posts. theater: production posts | Name, handle, link, optional logo | Organizer writes it in their own voice | Links to the posts |

Youth sports: `category_details.level = 'youth'` means no evidence item may be published, whatever the organizer ticks, and the evidence form says so. The contract is explicit that youth participation does not create permission to publish identifying evidence about minors.

## 5. States

One category-neutral vocabulary, derived from facts already stored plus the new deliverable and evidence records. Music maps onto it without changing what music does.

| State | Meaning | Music today |
| --- | --- | --- |
| `paid` | Charge held, nothing else yet | `payment_status = held` |
| `awaiting_materials` | The opportunity needs something from the sponsor and it has not arrived | `mark_status = none` |
| `materials_submitted` | Arrived, organizer has not answered | `mark_status = submitted` |
| `approved` | Organizer accepted the materials | `mark_status = approved` |
| `awaiting_delivery` | Accepted, or nothing was needed, and at least one deliverable has no evidence | Fundraiser not yet closed |
| `evidence_submitted` | Every deliverable has evidence, release not yet made | Not used: music releases on the calendar |
| `completed` | Delivered and fully released | `payment_status = released` |
| `released` | Some or all of the organizer's share has been transferred | Any `payout_schedule` row paid |
| `cancelled` | The organizer called the fundraiser off | `runs.status = cancelled` |
| `refunded` | Money went back, in full or in part | `refunded` or `partially_refunded` |
| `disputed` | A bank dispute is open on the charge | Recorded by hand only until remediation Phase 4 |

## Owner decisions

**Answered 2026-09-20.** Decision 1: evidence-gated, as proposed. Decisions 2 and 3: keep holding for now, which is what music does today, so nothing automatic happens when materials or evidence never arrive; the late and overdue states make it visible, and the refund-or-pay answer stays open. The rest are still open.

These are not mine to make. Each has a recommendation, and the build on this branch does not depend on any of them for music.

1. **What releases money outside music.** Proposed: evidence-gated, whole purchase, no calendar. The alternative is a calendar across the activity window, as music does. Recommendation: evidence-gated. A film credit and a jersey have no weekly rhythm, and releasing on a calendar would pay for a credit a year before it exists.
2. **Decision 16, materials that never arrive.** Refund, pay anyway, or keep holding and write to both sides. Recommendation: refund in full after a stated window (30 days past the materials due date), because a sponsor who never sent a logo received nothing. One answer for every category.
3. **Decision 19's open half, evidence that never arrives.** Same three options. Recommendation: the same answer as 2, as decision 19 itself asks.
4. **Evidence retention.** Proposed: life of the record. Recommendation stands unless counsel says otherwise; the legal pages must say whatever is chosen.
5. **Sponsor cancellation window.** Proposed: until materials are accepted. Recommendation stands.
6. **Turning a category on for live payments.** Each of sports, film and theater needs its policy marked active by you, after a completed test-mode purchase through delivery and release, and a second through refund. This branch builds the switch and leaves all three off.
