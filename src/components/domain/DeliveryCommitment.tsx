import { Eyebrow } from "@/components/Brand";
import { categoryWords } from "@/lib/category-words";
import type { Category, CommitmentView } from "@/lib/domain";

/**
 * What the organizer committed to document, on a fundraiser's page and in its preview.
 *
 * Only what they chose, handed in as data: the wording of each commitment lives in
 * src/lib/verification.ts and is never written by hand here (voice rule 6). Nothing on this block
 * claims Door Money went and looked, because Door Money does not. A fundraiser with nothing chosen
 * renders nothing at all, so it never shows an empty promise.
 *
 * The two sentences that are this component's own take their nouns from the category: a band
 * documents "where the logos appeared", and a theater company documents where its sponsors did,
 * because a credit in a program is not a logo.
 */
export function DeliveryCommitment({
  commitments,
  organizerName,
  fundraiserTitle,
  category,
  kind,
}: {
  commitments: CommitmentView[];
  organizerName: string;
  fundraiserTitle: string;
  category: Category;
  kind?: string | null;
}) {
  if (commitments.length === 0) return null;
  const words = categoryWords(category.key, kind);
  return (
    <section id="verification" className="border-t border-line py-16">
      <div data-reveal className="mx-auto max-w-[1120px] px-7">
        <Eyebrow className="mb-5">Placement verification</Eyebrow>
        <h2 className="heading mb-6 max-w-[22ch] text-[clamp(28px,4vw,46px)] leading-[1.02]">How the placements will be recorded</h2>
        <p className="mb-9 text-[clamp(16px,1.9vw,17px)] leading-[1.6]">
          {organizerName} will document where the {words.appearances} appeared during {fundraiserTitle}. Sponsors receive a record once it ends.
        </p>

        <ul className="grid max-w-[900px] gap-px border border-line bg-line sm:grid-cols-2">
          {commitments.map((item) => (
            <li key={item.key} className="grid grid-cols-[26px_1fr] items-start gap-4 bg-ground p-5">
              <span aria-hidden="true" className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border border-accent bg-accent text-[16px] leading-none text-on-accent">
                &#10003;
              </span>
              <span className="min-w-0">
                <b className="block text-[15px] font-medium leading-[1.45]">{item.label}</b>
                {item.detail && <span className="mt-1.5 block text-[15px] leading-[1.6] text-muted">{item.detail}</span>}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.6] text-muted">
          Documentation comes from the {words.organizer} and appears in the Door Money record.
        </p>
      </div>
    </section>
  );
}
