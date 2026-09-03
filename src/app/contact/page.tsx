import type { Metadata } from "next";
import { Page } from "@/components/Page";
import { Lines, Section, SectionHead } from "@/components/Brand";
import { ContactForm } from "@/components/ContactForm";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact Door Money about listing an act, backing a run, partnerships, press, or another question.",
};

const WHAT_HELPS = [
  "The act, business, venue, or publication name",
  "The run or placement involved, when applicable",
  "A clear question or proposed next step",
  "A deadline, when one is real",
];

export default function ContactPage() {
  return (
    <Page
      current="/contact"
      tape="A real person reads every note"
      title="Talk to Door"
      accent="Money"
      intro={
        <>
          <p className="typewriter text-[15px] text-red-deep">Questions, introductions, and useful propositions start here.</p>
          <p className="mt-4">
            Acts can ask about listing. Patrons and brands can ask about backing a run. Venues, press, and potential partners
            can introduce themselves. {SITE.name} reads every note and answers plainly.
          </p>
        </>
      }
      stamp={
        <>
          SEND<br />A<br />NOTE
        </>
      }
    >
      <Section>
        <SectionHead eyebrow={`Contact ${SITE.name}`}>Put a name to the question</SectionHead>
        <p>
          Pick the closest reason, add the details, and send it through. Messages about an active payment or placement should
          include the act or run name.
        </p>
        <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_280px] md:gap-12">
          <ContactForm />
          <aside aria-labelledby="what-helps" className="self-start">
            <div className="hard-border hard-shadow-sm bg-cream p-6">
              <h3 id="what-helps" className="poster mb-3 text-[22px] leading-none">
                What helps
              </h3>
              <Lines marked lines={WHAT_HELPS} className="text-[15px]" />
            </div>
            <p className="typewriter mt-5 text-[14.5px] leading-[1.7] text-gray">
              Email works too: <a href={`mailto:${SITE.contact}`} className="text-ink underline decoration-1 underline-offset-4 hover:text-red-deep">{SITE.contact}</a>
            </p>
          </aside>
        </div>
      </Section>
    </Page>
  );
}
