import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/Page";
import { Section, SectionHead, Steps } from "@/components/Brand";
import { ButtonLink } from "@/components/Button";
import { getBoard } from "@/lib/boards";
import { getCategoryLabels } from "@/lib/category-registry";
import { AVAILABILITY_NOTE } from "@/lib/starting-categories";
import { WIDGET_TIERS } from "@/lib/catalog";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { SITE } from "@/lib/site";
import { currentUser } from "@/lib/auth";
import { signupPath } from "@/lib/intent";
import { EXAMPLE_GROUPS, EXAMPLE_STATUS_LABEL, exampleHref, exampleStatus, newFundraiserPath, WHO_ORGANIZES } from "@/lib/organizer-examples";
import { starterKit } from "@/lib/starter-kits";

export const metadata: Metadata = {
  title: "Create a fundraiser",
  description: "Turn the audience around your work into sponsorships. Choose what to offer, set your own prices, and keep the final say. Door Money keeps 15% of completed sponsorships and charges nothing before something sells.",
};

// The address stays /list: it is in sent email. The page is "Create a fundraiser", for any organizer.
// It speaks to the organizer directly. The second person here is deliberate; see CLAUDE.md, voice rule 1.

const STEPS: [string, string][] = [
  ["Define what the funding enables", "Travel, equipment, a production, a season. One fundraiser, one named purpose, so a sponsor knows what the money makes possible."],
  ["Describe the audience", "Who the work reaches, and where: in a room, across a season, online. Leave out what you do not know."],
  ["Choose sponsorship options", "Pick the placements you have the authority to deliver. Anything not on offer stays off, and no sponsor's materials appear without your approval."],
  ["Set prices", "Your price is the price, fixed or open to bids. Door Money suggests one only where it has a sales history to suggest from."],
  ["State what sponsors receive", "What appears, where, and how you will document it. That statement is the promise a sponsor buys, so keep it the size you can deliver."],
  ["Publish when the fundraiser is ready", "A draft holds what is known so far. Publishing asks for the answers a sponsor needs, and nothing is public before then."],
];

// The fee is stated once, in the intro. These are the three things an organizer asks next.
const MONEY: [string, string][] = [
  ["When the money reaches you", "Door Money holds what a sponsor pays and releases your share under your fundraiser's terms. A music fundraiser pays out weekly across its dates."],
  ["Your call on every sponsor", "Every sponsor's materials need your approval before anything appears."],
  ["Your other income stays yours", `Tickets, sales, fees and grants are yours. ${SITE.name} only ever touches the sponsorship money it brings in.`],
];

/**
 * Whether the visitor has a session, which only decides where a link points. With no database
 * connected the app still serves this page from memory (README, "Run it"), and then nobody is
 * signed in. A failed read says the same: the link goes through sign-up, which is always safe.
 */
async function isSignedIn(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    return (await currentUser()) !== null;
  } catch {
    return false;
  }
}

export default async function ListPage() {
  const [sample, labels, signedIn] = await Promise.all([getBoard("gutter-hymns"), getCategoryLabels(), isSignedIn()]);
  // Somebody new makes an account and a profile first, and the account they make can do both
  // jobs: the intent only says which one this page sent them for.
  const startHref = signedIn ? newFundraiserPath() : signupPath("creator", "/dashboard/act/new");
  return (
    <Page
      theme="amber"
      current="/list"
      eyebrow="For organizers"
      title="Find sponsors for"
      accent="your work."
      headline="md"
      strap="For organizers"
      intro={
        <>
          <p className="max-w-[55ch]">
            Turn the audience around your work into sponsorships. You choose what to offer, what it costs and who
            appears beside your name.
          </p>
          <p className="caps mt-6 text-[14.5px] leading-[2] text-accent-ink">
            {SITE.name} keeps {SITE.feePercent}% of completed sponsorships. There is no fee before something sells.
          </p>
          <div className="mt-[30px] flex flex-wrap gap-4">
            <ButtonLink href={startHref} arrow>Create a fundraiser</ButtonLink>
          </div>
        </>
      }
    >
      <Section id="ideas">
        <SectionHead eyebrow="Start with a sponsorship idea">Choose a starter kit</SectionHead>
        <p className="max-w-[62ch]">
          A starter kit fills the new fundraiser form with examples. Change any of them. Choosing one offers nothing,
          sets no price and publishes nothing: your price is the price.
        </p>
        <div className="mt-9 grid gap-10">
          {EXAMPLE_GROUPS.map((group) => {
            const kits = group.examples.flatMap((example) => {
              const kit = starterKit(example.kitKey);
              return kit ? [{ example, status: exampleStatus(kit, labels) }] : [];
            });
            if (kits.length === 0) return null;
            // A group is as open as its least open example, and says so once, beside its name.
            const held = kits.find((k) => k.status !== "open")?.status;
            return (
              <div key={group.categoryKey}>
                <h3 className="caps flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[14px] text-accent-ink">
                  {group.heading}
                  {held && held !== "open" && <span className="border border-line px-2 py-0.5 text-muted">{EXAMPLE_STATUS_LABEL[held]}</span>}
                </h3>
                {held === "coming_soon" && (
                  <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
                    {SITE.name} has not opened this category. These are examples of what it could hold. None of them
                    can be created, published or paid for today.
                  </p>
                )}
                {held === "draft_only" && (
                  <p className="mt-3 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
                    {SITE.name} has opened this category for private drafts only. A fundraiser started here cannot be
                    published or paid for yet.
                  </p>
                )}
                <div className="mt-4 grid gap-px bg-line sm:grid-cols-2">
                  {kits.map(({ example, status }) => {
                    const href = exampleHref(example.kitKey, status, signedIn);
                    const body = (
                      <>
                        <span className="heading block text-[20px] leading-[1.2]">{example.title}</span>
                        <span className="mt-2 block text-[15px] leading-[1.6] text-muted">{example.line}</span>
                        <span className="caps mt-4 block text-[14px] text-accent-ink">
                          {href ? <>Start from this idea &rarr;</> : "Example only"}
                        </span>
                      </>
                    );
                    return href
                      ? <Link key={example.kitKey} href={href} className="lift block bg-ground p-6 text-ink no-underline">{body}</Link>
                      : <div key={example.kitKey} className="bg-ground p-6">{body}</div>;
                  })}
                </div>
                {held === "coming_soon" && (
                  <div className="mt-5">
                    <ButtonLink href="/contact" variant="ghost">Ask about this category</ButtonLink>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-8 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">
          Every example is a possibility, not an included benefit. An organizer offers only what they have the
          authority to deliver.
        </p>
      </Section>

      <Section>
        <SectionHead eyebrow="Six steps">From a purpose to a published fundraiser</SectionHead>
        <Steps steps={STEPS} size="lg" ruleFirst={false} className="mt-[34px] max-w-[720px]" />
      </Section>

      <Section>
        <SectionHead eyebrow="Who organizes">Any organizer with a clear promise</SectionHead>
        <dl className="mt-9 grid gap-px border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {WHO_ORGANIZES.map(([who, what]) => (
            <div key={who} className="bg-ground p-6">
              <dt className="heading text-[20px] leading-[1.2]">{who}</dt>
              <dd className="mt-2 text-[15px] leading-[1.6] text-muted">{what}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 max-w-[62ch] text-[14.5px] leading-[1.7] text-muted">{AVAILABILITY_NOTE}</p>
      </Section>

      <Section>
        <SectionHead eyebrow="For music fundraisers">A widget for a musician&apos;s own site</SectionHead>
        <div className="mt-[30px] grid items-center gap-9 md:grid-cols-[1.1fr_1fr]">
          <div>
            <p>
              A music fundraiser comes with a widget for the musician&apos;s own site. It shows the current
              fundraiser and takes backings from fans, on the musician&apos;s own page rather than a third
              party&apos;s.
            </p>
            <p className="mt-4 text-[14.5px] leading-[1.7] text-muted">
              It arrives on day one at no extra cost. Backings and their tiers are built for music.
              Other categories do not have a widget yet.
            </p>
            <div className="mt-[26px] flex flex-wrap gap-[18px]">
              <ButtonLink href="/widget" variant="ghost">See the music widget</ButtonLink>
            </div>
          </div>
          {sample && (
            <div aria-hidden="true" className="edge glow max-w-[340px] bg-panel">
              <div className="caps flex items-center justify-between border-b border-line px-3.5 py-2.5 text-[14px]">
                Back the {sample.run.title.toLowerCase()}
                <i className="not-italic text-accent-ink">{SITE.name}</i>
              </div>
              <div className="px-3.5 py-3">
                <b className="block text-[15px]">{sample.act.name}</b>
                <small className="caps text-[14px] text-muted">
                  {sample.run.showCount} shows. {formatDateRange(sample.run.startsOn, sample.run.endsOn)}.
                </small>
                <div className="relative mt-2.5 h-1.5 bg-line">
                  <i className="absolute inset-y-0 left-0 w-[59%] bg-accent" />
                </div>
                <div className="mt-2.5 grid gap-1.5">
                  {[...WIDGET_TIERS.map((t) => [t.title, formatMoney(t.amountCents)]), ["Take a sponsorship", "$500+"]].map(([title, price], i) => (
                    <span key={title} className={`flex justify-between border border-line px-2.5 py-1.5 text-[14px] ${i === 0 ? "border-accent-line! bg-accent/10" : ""}`}>
                      {title}
                      <b>{price}</b>
                    </span>
                  ))}
                </div>
              </div>
              <div className="caps mx-3.5 mb-3.5 mt-3 border border-accent-line bg-accent p-[10px] text-center text-[14px] text-on-accent">
                Back for {formatMoney(WIDGET_TIERS[0].amountCents)}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section>
        <SectionHead eyebrow="The money">When you are paid, and what stays yours</SectionHead>
        <div className="mt-[34px] grid gap-[26px] md:grid-cols-2">
          {MONEY.map(([title, body]) => (
            <div key={title}>
              <b className="heading mb-1.5 block text-[20px]">{title}</b>
              <p className="max-w-none text-[15px] text-muted">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="list">
        <SectionHead eyebrow="Create a fundraiser">Claim an address and publish</SectionHead>
        <p>
          Your username is your address, so the fundraiser goes up at an address of its own and on the fundraisers
          page.
        </p>
        <div className="mt-[34px] flex flex-wrap gap-4">
          <ButtonLink href={startHref} arrow>Create a fundraiser</ButtonLink>
          <ButtonLink href="/how-sponsorship-works" variant="ghost">How it works</ButtonLink>
        </div>
      </Section>
    </Page>
  );
}
