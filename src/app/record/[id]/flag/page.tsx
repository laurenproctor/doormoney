import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Section, SectionHead } from "@/components/Brand";
import { Page } from "@/components/Page";
import { themeFor } from "@/components/Theme";
import { flagTarget } from "@/lib/flags";
import { periodOf } from "@/lib/periods";
import { supabaseAdmin } from "@/lib/supabase/server";
import { FlagForm } from "./FlagForm";

/*
  "I don't think this happened." The sponsor's side of Phase 6. Reached from the record and from the
  receipt email, and it needs no account: the id is the same unguessable one the record uses.
  Raising the flag holds every payment still to go out on this sponsorship, and nothing else. One
  wording for every category: music's calendar and everybody else's evidence rule both release a
  share only for what did happen, so that is what the page says.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Something is wrong with this fundraiser", robots: { index: false, follow: false } };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FlagPage({ params }: Props) {
  const { id } = await params;
  if (!ID.test(id)) notFound();
  const target = await flagTarget(supabaseAdmin(), id);
  if (!target) notFound();

  const open = Boolean(target.flagged_at && !target.flag_cleared_at);
  const period = periodOf(target.kind).noun;
  const recordHref = `/record/${id}`;

  return (
    <Page
      theme={themeFor(target.actSlug)}
      current="/fundraisers"
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
              A sponsorship is paid for up front, and Door Money releases the money to {target.actName} under the fundraiser&apos;s terms as the {period} goes on.
              If the {period} stops happening, or the promise is not being kept, saying so here holds what has not been released.
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
            Money already released for what did happen stays released. Everything not yet released is held. Door Money reads the note, checks with{" "}
            {target.actName}, and either releases the hold or sends the unreleased part back to the card it was paid with. {target.actName} is not told by
            this page; Door Money looks first.
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
            The hold stays until Door Money has looked. Anything already released to {target.actName} for what did happen is not affected. A note about
            the outcome comes by email.
          </p>
        </Section>
      )}
    </Page>
  );
}
