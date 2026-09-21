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
import { materialsOutcome, materialsRules, materialsStrap, materialsWords } from "@/lib/materials-words";
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
  if (!p) return { title: "Send your materials", robots: { index: false } };
  const w = materialsWords(p.lots.runs.category_key, p.lots.runs.kind);
  return { title: `${w.pageTitle} for ${p.lots.runs.acts.name}`, robots: { index: false, follow: false } };
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

  // Music sends a logo and says so, in the words it always has. Every other category sends
  // materials, which may be one line of text: src/lib/materials-words.ts.
  const w = materialsWords(run.category_key, run.kind);
  const state = materialsStrap(w, { status: p.mark_status, fundraiserStatus: run.status, organizerName: act.name });
  // Only music has run dates. Nothing is printed in their place anywhere else.
  const dates = w.music || (run.starts_on && run.ends_on) ? `, ${formatDateRange(run.starts_on, run.ends_on)}` : "";

  return (
    <Page
      theme={themeFor(act.slug)}
      current="/auctions"
      eyebrow={w.title}
      title={w.music ? "Send the logo for the" : "Send your materials for the"}
      accent={surface.toLowerCase()}
      headline="md"
      strap={state}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {act.name}. {run.title}{dates}.
          </p>
          <p className="mt-5">
            {p.patrons?.name ?? "A patron"} holds the {surface.toLowerCase()} on this {w.fundraiser}.{" "}
            {w.music ? "The logo is the name or image as it will appear" : "Your materials are the name, the wording or the artwork as it will appear"}
            {seenBy ? `, seen by ${seenBy}` : ""}.
          </p>
        </>
      }
    >
      <Section>
        {open ? (
          <>
            <SectionHead eyebrow={p.mark_status === "submitted" ? "Already sent" : "What to send"}>
              {p.mark_status === "submitted" ? (w.music ? `${act.name} has the logo` : `${act.name} has your materials`) : w.whatToSend}
            </SectionHead>
            <p className="mb-9 max-w-[62ch] text-muted">
              {p.mark_status === "submitted"
                ? `Nothing else is needed. Sending again before ${act.name} decides replaces what is there.`
                : `${act.name} sees it on the dashboard, ${w.music ? "approves" : "accepts"} or declines it, and Door Money sends an email either way.`}
            </p>
            <MarkForm
              purchaseId={p.id}
              actName={act.name}
              surface={surface}
              categoryKey={run.category_key}
              kind={run.kind}
              resend={p.mark_status === "submitted"}
              currentUrl={p.mark_url}
              currentText={p.mark_text}
              currentNote={p.mark_note}
            />
          </>
        ) : (
          <>
            <SectionHead eyebrow="Where it stands">
              {p.mark_status === "approved" ? `${act.name} said yes` : p.mark_status === "declined" ? "Declined and refunded" : `The ${w.fundraiser} was cancelled`}
            </SectionHead>
            <p className="max-w-[62ch] text-muted">
              {materialsOutcome(w, { status: p.mark_status, organizerName: act.name, what: surface.toLowerCase() })}
            </p>
            {p.mark_url && (
              <div className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.mark_url} alt={w.music ? "The logo" : "The file that was sent"} className="edge h-[120px] w-[200px] bg-panel object-contain p-3" />
              </div>
            )}
          </>
        )}
      </Section>

      <Section>
        <SectionHead eyebrow="How it goes">The {w.organizer} has the final say</SectionHead>
        <Lines marked lines={materialsRules(w, act.name)} />
        <div className="mt-9 flex flex-wrap gap-4">
          <ButtonLink href={`/record/${p.id}`} variant="ghost" arrow>
            The record
          </ButtonLink>
          <ButtonLink href={runPath(act.slug, run.slug)} variant="ghost">
            {act.name}&apos;s page
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
