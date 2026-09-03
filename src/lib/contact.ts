// The reasons a person can pick on /contact. Keys match the check constraint in 0004_contact_messages.sql.
export const CONTACT_REASONS = [
  ["list_an_act", "List an act"],
  ["back_a_run", "Back a run"],
  ["partnership", "Brand or business partnership"],
  ["venue", "Venue"],
  ["press", "Press"],
  ["payment_or_placement", "Payment or placement question"],
  ["something_else", "Something else"],
] as const;

export type ContactReason = (typeof CONTACT_REASONS)[number][0];

export const CONTACT_REASON_KEYS = CONTACT_REASONS.map(([k]) => k) as [ContactReason, ...ContactReason[]];

export function contactReasonLabel(key: ContactReason): string {
  return CONTACT_REASONS.find(([k]) => k === key)?.[1] ?? key;
}
