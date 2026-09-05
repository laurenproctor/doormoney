import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Lines, Section, SectionHead } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { Page } from "@/components/Page";
import { themeFor } from "@/components/Theme";
import { formatDateRange } from "@/lib/dates";
import { markOpen, markSeenBy, markSurface, markTarget } from "@/lib/marks";
import { runPath } from "@/lib/urls";
import { MarkForm } from "./MarkForm";

/*
  Where a patron sends the mark for a placement they bought. The URL carries the purchase id, which
  nobody can guess; it reaches the patron in the receipt. No account, no password: the act still has
  to approve whatever arrives, so the link cannot do damage on its own.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const p = await markTarget(id);
  if (!p) return { title: "Send the mark", robots: { index: false } };
  return { title: `Send the mark for ${p.lots.runs.acts.name}`, robots: { index: false, follow: false } };
}

export default async function MarkPage({ params }: Props) {
  const { id } = await params;
  const p = await markTarget(id);
  if (!p) notFound();

  const run = p.lots.runs;
  const act = run.acts;
  const surface = markSurface(p);
  const seenBy = markSeenBy(p);
  const open = markOpen(p);
  const decided = p.mark_status === "approved" || p.mark_status === "declined";

  const state = decided
    ? p.mark_status === "approved"
      ? "The mark is approved"
      : "The mark was declined"
    : run.status === "cancelled"
      ? "The run was cancelled"
      : p.mark_status === "submitted"
        ? `Waiting on ${act.name}`
        : `${act.name} is waiting for the mark`;

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow="The mark"
      title="Send the mark for the"
      accent={surface.toLowerCase()}
      headline="md"
      strap={state}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {act.name}. {run.title}, {formatDateRange(run.starts_on, run.ends_on)}.
          </p>
          <p className="mt-5">
            {p.patrons?.name ?? "A patron"} holds the {surface.toLowerCase()} on this {run.kind === "season" ? "season" : "run"}. The
            mark is the name or logo as it will appear{seenBy ? `, seen by ${seenBy}` : ""}.
          </p>
        </>
      }
    >
      <Section>
        {open ? (
          <>
            <SectionHead eyebrow={p.mark_status === "submitted" ? "Already sent" : "What to send"}>
              {p.mark_status === "submitted" ? `${act.name} has the mark` : "A logo, a name, or both"}
            </SectionHead>
            <p className="mb-9 max-w-[62ch] text-muted">
              {p.mark_status === "submitted"
                ? `Nothing else is needed. Sending again before ${act.name} decides replaces what is there.`
                : `${act.name} sees it on the dashboard, approves or declines it, and Door Money sends an email either way.`}
            </p>
            <MarkForm
              purchaseId={p.id}
              actName={act.name}
              surface={surface}
              resend={p.mark_status === "submitted"}
              currentUrl={p.mark_url}
              currentText={p.mark_text}
              currentNote={p.mark_note}
            />
          </>
        ) : (
          <>
            <SectionHead eyebrow="Where it stands">
              {p.mark_status === "approved" ? `${act.name} said yes` : p.mark_status === "declined" ? "Declined and refunded" : "The run was cancelled"}
            </SectionHead>
            <p className="max-w-[62ch] text-muted">
              {p.mark_status === "approved"
                ? `The mark goes on the ${surface.toLowerCase()} for the whole run. Changing it now goes through Door Money.`
                : p.mark_status === "declined"
                  ? `${act.name} declined the mark, so the placement never runs and the money went back to the card it came from.`
                  : `${act.name} cancelled the run, so the placement never runs and the money went back to the card it came from.`}
            </p>
            {p.mark_url && (
              <div className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.mark_url} alt="The mark" className="edge h-[120px] w-[200px] bg-panel object-contain p-3" />
              </div>
            )}
          </>
        )}
      </Section>

      <Section>
        <SectionHead eyebrow="How it goes">The act has the final say</SectionHead>
        <Lines
          marked
          lines={[
            "The mark is the patron's own name or logo, or one the patron has the right to use.",
            `${act.name} approves or declines it. Nothing goes up without their yes.`,
            "A declined mark means the placement never runs, and the money goes back in full.",
            "An approved mark stays on the surface for the whole run.",
          ]}
        />
        <div className="mt-9 flex flex-wrap gap-4">
          <ButtonLink href={`/record/${p.id}`} variant="ghost" arrow>
            The record of the run
          </ButtonLink>
          <ButtonLink href={runPath(act.slug, run.slug)} variant="ghost">
            {act.name}&apos;s board
          </ButtonLink>
        </div>
        <p className="mt-8 text-[14.5px] text-muted">
          Something wrong with the placement?{" "}
          <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
            Send Door Money a note
          </Link>
          .
        </p>
      </Section>
    </Page>
  );
}
