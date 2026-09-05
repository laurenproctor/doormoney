import { Eyebrow } from "@/components/Brand";
import { verificationItems, type VerificationChoice } from "@/lib/verification";

/**
 * What patrons get back from this fundraiser, on its public page and in the draft preview.
 *
 * It sits between the sponsorship options and the fan section on purpose: a patron reads it while
 * they are still deciding. Only the methods the musician ticked are here. Nothing on this block
 * claims Door Money went and looked, because Door Money does not; the disclosure says where it
 * comes from.
 *
 * A fundraiser with nothing chosen renders nothing at all, so pages published before this existed
 * keep working and never show an empty promise.
 */
export function PlacementVerification({
  actName,
  runTitle,
  verification,
}: {
  actName: string;
  runTitle: string;
  verification: Partial<VerificationChoice> | null | undefined;
}) {
  const items = verificationItems(verification);
  if (items.length === 0) return null;

  return (
    <section id="verification" className="border-t border-line py-16">
      <div data-reveal className="mx-auto max-w-[1120px] px-7">
        <Eyebrow className="mb-5">Placement verification</Eyebrow>
        <h2 className="heading mb-6 max-w-[22ch] text-[clamp(28px,4vw,46px)] leading-[1.02]">How the placements will be recorded</h2>
        <p className="mb-9 text-[clamp(16px,1.9vw,17px)] leading-[1.6]">
          {actName} will document where the logos appeared during {runTitle}. Sponsors receive a record once it ends.
        </p>

        <ul className="grid max-w-[900px] gap-px border border-line bg-line sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key} className="grid grid-cols-[26px_1fr] items-start gap-4 bg-ground p-5">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border border-accent bg-accent text-[16px] leading-none text-on-accent"
              >
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
          Documentation comes from the musician and appears in the Door Money record.
        </p>
      </div>
    </section>
  );
}
