import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead } from "@/components/Brand";
import { Page } from "@/components/Page";
import { themeFor } from "@/components/Theme";
import { flagTarget } from "@/lib/flags";
import { supabaseAdmin } from "@/lib/supabase/server";
import { FlagForm } from "./FlagForm";

/*
  "I don't think this ran." The patron's side of Phase 6. Reached from the record and from the
  receipt email, and it needs no account: the id is the same unguessable one the record uses.
  Raising the flag holds every payment still to go out on this placement, and nothing else.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Something is wrong with this run", robots: { index: false, follow: false } };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FlagPage({ params }: Props) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const target = await flagTarget(supabaseAdmin(), id);
  if (!target) notFound();

  const open = Boolean(target.flagged_at && !target.flag_cleared_at);
  const period = target.season ? "season" : "run";
  const recordHref = `/record/${id}`;

  return (
    <Page
      theme={themeFor(target.actSlug)}
      current="/auctions"
      eyebrow={open ? "Door Money is looking" : "Something wrong"}
      title="Say what"
      accent="happened"
      headline="md"
      strap={`${target.actName}. ${target.runTitle}.`}
      intro={
        <>
          <p className="caps text-[14.5px] leading-[2]">
            {target.actName}. {target.runTitle}. {target.what}.
          </p>
          {open ? (
            <p className="mt-5">
              This one is already flagged. Every payment still to go out on it is on hold while Door Money looks, and someone will be in touch.
            </p>
          ) : (
            <p className="mt-5">
              A placement is paid for before the {period} starts, and the money reaches {target.actName} week by week as it goes on. If the {period} stops
              happening, saying so here holds the rest of it.
            </p>
          )}
          <p className="mt-4 text-[15px] text-muted">
            The full record of the {period} is at{" "}
            <Link href={recordHref} className="text-accent-ink underline decoration-1 underline-offset-4">
              this address
            </Link>
            .
          </p>
        </>
      }
    >
      {!open && (
        <Section>
          <SectionHead eyebrow="What this does">The money stops, and a person reads it</SectionHead>
          <p className="text-muted">
            Slices already sent for weeks the {period} played stay sent. Everything not yet released is held. Door Money reads the note, checks with{" "}
            {target.actName}, and either releases the hold or sends the unreleased part back to the card it was paid with. The act is not told by this
            page; Door Money looks first.
          </p>
          <div className="mt-8 max-w-[720px]">
            <FlagForm id={id} what={target.what} />
          </div>
        </Section>
      )}

      {open && (
        <Section>
          <SectionHead eyebrow="Next">Nothing else to do</SectionHead>
          <p className="text-muted">
            The hold stays until Door Money has looked. Anything already sent to {target.actName} for weeks the {period} played is not affected. A note
            about the outcome comes by email.
          </p>
        </Section>
      )}
    </Page>
  );
}
