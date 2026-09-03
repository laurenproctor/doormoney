import type { Metadata } from "next";
import Link from "next/link";
import { Bullets, Contact, LegalPage, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "The few cookies Door Money sets, what each one does, and what the banner at the bottom of the page is for.",
};

const UPDATED = "September 3, 2026";

const COOKIES: { name: string; setBy: string; purpose: string; lasts: string }[] = [
  {
    name: "sb-…-auth-token",
    setBy: SITE.name,
    purpose: "Keeps a signed-in act or patron signed in between pages. Set only after sign-in.",
    lasts: "Refreshes while the person keeps using the site, and ends at sign-out.",
  },
  {
    name: "dm_cookies",
    setBy: SITE.name,
    purpose: "Remembers that the cookie notice at the bottom of the page was accepted, so it stays out of the way on the next visit.",
    lasts: "One year.",
  },
  {
    name: "__stripe_mid",
    setBy: "Stripe",
    purpose: "Fraud prevention inside the payment form. Lets Stripe recognise a device it has seen make a payment before.",
    lasts: "One year.",
  },
  {
    name: "__stripe_sid",
    setBy: "Stripe",
    purpose: "Fraud prevention inside the payment form, for the current payment session.",
    lasts: "30 minutes.",
  },
];

const SECTIONS: LegalSection[] = [
  {
    id: "what",
    heading: "What a cookie is",
    body: (
      <p>
        A cookie is a small text file a site asks the browser to keep, so the site can recognise the same browser on the next
        request. Some cookies are needed for a site to work at all, such as the one that keeps a person signed in. Others exist
        to track people across sites for advertising. {SITE.name} sets only the first kind.
      </p>
    ),
  },
  {
    id: "list",
    heading: "The cookies Door Money sets",
    body: (
      <>
        <p>Four, and two of them belong to Stripe and appear only while someone is paying.</p>
        <div className="overflow-x-auto">
          <table className="hard-border w-full min-w-[560px] border-collapse bg-cream text-[15px] leading-[1.55]">
            <thead>
              <tr className="typewriter bg-ink text-left text-paper">
                <th className="p-3 font-normal">Cookie</th>
                <th className="p-3 font-normal">Set by</th>
                <th className="p-3 font-normal">What it does</th>
                <th className="p-3 font-normal">How long</th>
              </tr>
            </thead>
            <tbody>
              {COOKIES.map((c) => (
                <tr key={c.name} className="border-t-2 border-dashed border-gray align-top">
                  <td className="typewriter p-3 whitespace-nowrap">{c.name}</td>
                  <td className="p-3">{c.setBy}</td>
                  <td className="p-3">{c.purpose}</td>
                  <td className="p-3">{c.lasts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="typewriter text-[14.5px] text-gray">
          The sign-in cookie&apos;s full name includes the project reference of the database it belongs to, so the middle part varies.
        </p>
      </>
    ),
  },
  {
    id: "not",
    heading: "What Door Money does not use",
    body: (
      <>
        <Bullets
          items={[
            "No analytics cookies. Door Money runs no analytics scripts at all.",
            "No advertising cookies, no retargeting, no social media pixels.",
            "No third-party fonts. The typefaces are served from Door Money's own servers, so no font provider sees a visit.",
            "No chat widgets or other embedded services on the marketing pages.",
          ]}
        />
        <p>
          The law asks for consent before a site sets cookies that are not strictly necessary. {SITE.name} sets none of
          those. The banner at the bottom of the page is a notice, not a request: it says what the site sets and links here.
          Accepting it sets one more cookie, so the banner stays away for a year.
        </p>
      </>
    ),
  },
  {
    id: "widget",
    heading: "The widget on other sites",
    body: (
      <>
        <p>
          When an act embeds the widget, it loads inside a frame served by {SITE.name}. The widget sets no cookies until a fan
          starts a payment, at which point Stripe&apos;s two cookies apply inside the frame only. The act&apos;s own site may set cookies
          of its own; those are the act&apos;s, and the act&apos;s own policy covers them. See the{" "}
          <Link href="/widget">widget page</Link> for how the embed works.
        </p>
      </>
    ),
  },
  {
    id: "storage",
    heading: "Other browser storage",
    body: (
      <p>
        {SITE.name} does not currently use local storage, session storage or any other browser storage. If that changes, this
        page will say so and explain why.
      </p>
    ),
  },
  {
    id: "control",
    heading: "How to control cookies",
    body: (
      <>
        <p>
          Every browser lets a person see, block and delete cookies through its settings, usually under privacy. Blocking all
          cookies on {SITE.name} has two effects: sign-in stops working, and Stripe may decline a payment it cannot check for
          fraud. Everything else on the site, including every board and every public page, works without cookies.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    heading: "Changes and contact",
    body: (
      <p>
        {SITE.name} posts changes here and updates the date at the top. Questions go to <Contact />. The{" "}
        <Link href="/privacy">privacy policy</Link> covers what happens to the information the site collects.
      </p>
    ),
  },
];

export default function CookiesPage() {
  return (
    <LegalPage
      path="/cookies"
      tape="House paper"
      title="Cookie"
      accent="policy"
      intro={
        <p>
          {SITE.name} sets almost no cookies. This page lists the ones it does, what each one is for, and what the banner
          at the bottom of the page is asking.
        </p>
      }
      stamp={
        <>
          NOTHING<br />TO<br />TRACK
        </>
      }
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
