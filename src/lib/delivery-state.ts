/**
 * Where a sponsorship stands, in one vocabulary for every category.
 *
 * Derived, never stored. The facts are already in the database: the payment status, the materials
 * status (`purchases.mark_status`, which has always meant "did the organizer accept what the sponsor
 * sent", logo or not), the fundraiser's status, the payout rows, and for evidence-released
 * purchases the deliverables and their evidence. This file turns those into the states in
 * docs/DELIVERY_POLICY_MATRIX.md, section 5, so a record, an email and a dashboard say the same
 * thing about the same purchase whatever category it is in.
 *
 * Music maps onto it without changing what music does.
 *
 * Pure, and importable anywhere.
 */
import type { ReleaseRule } from "@/lib/delivery-policy";

export type DeliveryState =
  | "unpaid"
  | "paid"
  | "awaiting_materials"
  | "materials_submitted"
  | "approved"
  | "awaiting_delivery"
  | "evidence_submitted"
  | "released"
  | "completed"
  | "cancelled"
  | "refunded"
  | "disputed";

export type DeliveryFacts = {
  releaseRule: ReleaseRule;
  /** purchases.payment_status */
  paymentStatus: string;
  /** purchases.mark_status: none, submitted, approved, declined. */
  materialsStatus: string;
  /** runs.status */
  fundraiserStatus: string;
  amountCents: number;
  refundedCents: number;
  /** A bank dispute is open on the charge. Recorded by hand until remediation Phase 4 handles the events. */
  disputeOpen?: boolean;
  deliverables: { status: string; hasEvidence: boolean; dueAt?: string | null }[];
  payouts: { status: string; amountCents: number }[];
};

export type DeliveryStanding = {
  /** The one state to lead with. */
  state: DeliveryState;
  /** Everything else that is also true, for a page that wants to say more. */
  also: DeliveryState[];
  /** Deliverables past their date with nothing attached. Held, and visible: nothing automatic follows. */
  lateDeliverables: number;
  releasedCents: number;
};

const PAID = ["held", "released", "refunded", "partially_refunded"];

/**
 * The order below is the order of precedence. A dispute outranks everything because it is the one
 * state where Door Money's own money is at risk; money going back outranks delivery because a
 * refunded sponsorship is no longer owed anything.
 */
export function deliveryStanding(f: DeliveryFacts, now: Date = new Date()): DeliveryStanding {
  const releasedCents = f.payouts.filter((p) => p.status === "paid").reduce((n, p) => n + p.amountCents, 0);
  const late = f.deliverables.filter((d) => d.status === "pending" && !d.hasEvidence && d.dueAt && new Date(d.dueAt) < now).length;
  const found: DeliveryState[] = [];

  if (!PAID.includes(f.paymentStatus)) return { state: "unpaid", also: [], lateDeliverables: 0, releasedCents: 0 };

  if (f.disputeOpen) found.push("disputed");
  if (f.refundedCents > 0 || f.paymentStatus === "refunded" || f.paymentStatus === "partially_refunded") found.push("refunded");
  if (f.fundraiserStatus === "cancelled") found.push("cancelled");

  const owed = f.deliverables.filter((d) => d.status !== "waived");
  const allDocumented = owed.length > 0 && owed.every((d) => d.status === "delivered" || d.hasEvidence);
  const fullyReleased = f.paymentStatus === "released" || (f.payouts.length > 0 && f.payouts.every((p) => p.status === "paid" || p.status === "skipped") && releasedCents > 0);

  if (fullyReleased && (f.releaseRule === "calendar" || allDocumented)) found.push("completed");
  if (releasedCents > 0) found.push("released");

  if (f.materialsStatus === "none") found.push("awaiting_materials");
  else if (f.materialsStatus === "submitted") found.push("materials_submitted");
  else if (f.materialsStatus === "approved") {
    if (f.releaseRule === "evidence" && allDocumented) found.push("evidence_submitted");
    else if (f.releaseRule === "evidence" || !["closed", "cancelled"].includes(f.fundraiserStatus)) found.push("awaiting_delivery");
    found.push("approved");
  }
  found.push("paid");

  const [state, ...also] = [...new Set(found)];
  return { state, also, lateDeliverables: late, releasedCents };
}

/** Words for a state, for a record or an email. Third person, so they read the same to either side. */
export const STATE_LABEL: Record<DeliveryState, string> = {
  unpaid: "Not paid",
  paid: "Paid, and held by Door Money",
  awaiting_materials: "Waiting on the sponsor's materials",
  materials_submitted: "Materials sent, waiting on the organizer",
  approved: "Materials accepted",
  awaiting_delivery: "Waiting on delivery",
  evidence_submitted: "Delivered, release on the next Friday",
  released: "Released to the organizer",
  completed: "Delivered and released in full",
  cancelled: "Fundraiser cancelled",
  refunded: "Refunded",
  disputed: "Disputed with the bank",
};
