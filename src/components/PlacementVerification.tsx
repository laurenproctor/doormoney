import { DeliveryCommitment } from "@/components/domain";
import { verificationItems, type VerificationChoice } from "@/lib/verification";

/**
 * What sponsors get back from this fundraiser, on its public page and in the draft preview.
 *
 * This is the adapter: it turns the fundraiser's stored choice into the commitments it made, in the
 * words src/lib/verification.ts holds for its category, and hands them to DeliveryCommitment, which
 * draws them. Only the methods the organizer ticked are here, and a fundraiser with nothing chosen
 * renders nothing at all, so pages published before this existed keep working.
 *
 * It sits between the sponsorship options and the fan section on purpose: a sponsor reads it while
 * they are still deciding.
 */
export function PlacementVerification({
  actName,
  runTitle,
  verification,
  categoryKey,
  kind,
}: {
  actName: string;
  runTitle: string;
  /** Which category's words to use. The stored keys are the same in every category. */
  categoryKey: string;
  /** Music's stored kind, where there is one. */
  kind?: string | null;
  verification: Partial<VerificationChoice> | null | undefined;
}) {
  return (
    <DeliveryCommitment
      commitments={verificationItems(verification, categoryKey)}
      organizerName={actName}
      fundraiserTitle={runTitle}
      category={{ key: categoryKey }}
      kind={kind}
    />
  );
}
