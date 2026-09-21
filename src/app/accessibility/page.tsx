import type { Metadata } from "next";
import { Bullets, Contact, LegalPage, type LegalSection } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Accessibility",
  description: "How Door Money keeps the site usable for everyone, where it falls short, and how to report a problem.",
};

const UPDATED = "September 21, 2026";

const SECTIONS: LegalSection[] = [
  {
    id: "standard",
    heading: "The standard",
    body: (
      <p>
        {SITE.name} builds to the Web Content Accessibility Guidelines (WCAG) version 2.2, level AA. That is the level most
        laws and public bodies point to, and it covers the things that matter most: keyboard use, screen readers, contrast,
        zoom, and clear forms.
      </p>
    ),
  },
  {
    id: "does",
    heading: "What the site does",
    body: (
      <Bullets
        items={[
          "Uses real HTML: headings in order, lists, buttons, links and landmarks, so screen readers and other assistive tools can move around the page.",
          "Works from the keyboard alone. Every link, button and form field can be reached with the Tab key, and the focused element shows an outline in the page's accent color.",
          "Sets light text on a dark background. Body text and small colored text meet the 4.5 to 1 contrast minimum, and color is never the only signal.",
          "Scales with the browser. Text and layout hold together at 200% zoom and on screens 380 pixels wide.",
          "Labels every form field, and reports errors in words next to the field they belong to.",
          "Hides decorative seals, stage lights and diagrams from screen readers, and gives every meaningful image a text alternative.",
          "Holds still for anyone whose system asks for reduced motion: the stage lights stop swaying, sections stop rising into place, and smooth scrolling turns off. Nothing on the site flashes.",
          "Gives auction closing times in words as well as a countdown, and never times out a form.",
        ]}
      />
    ),
  },
  {
    id: "limits",
    heading: "Known limits",
    body: (
      <>
        <p>Honesty helps more than a clean bill of health. These are the gaps {SITE.name} knows about.</p>
        <Bullets
          items={[
            "Page titles use a high-contrast serif typeface in capitals, which some readers find slower to read. Everything else uses a plain sans-serif face, and every page can be read at any zoom.",
            "The site has one look, a dark one, and no light mode. A reader who needs dark text on a light page has to rely on the browser's reader view or a forced-colors setting, and Door Money has not tested the site in either yet.",
            "The stage lights at the top of each page sway slowly unless the system asks for reduced motion. They are decoration and are hidden from assistive tools.",
            "The payment form comes from Stripe. It is built to be accessible, and Door Money cannot change its internals.",
            "The widget lives in a frame on an organizer's own site. Door Money's snippet gives the frame a title, and the rest of that page is the organizer's.",
            "Photos and evidence an organizer adds to a record carry the description the organizer wrote. Door Money asks for one but cannot check it.",
            "No outside auditor has reviewed the site yet. That review is planned.",
          ]}
        />
      </>
    ),
  },
  {
    id: "testing",
    heading: "How Door Money checks",
    body: (
      <p>
        Before a page ships, {SITE.name} walks through it with a keyboard alone, at 200% zoom, at 380 pixels wide, and with a
        screen reader. Pages are checked again whenever they change. Problems found this way go on the list above until they are
        fixed.
      </p>
    ),
  },
  {
    id: "report",
    heading: "Reporting a problem",
    body: (
      <>
        <p>
          Anyone who hits a barrier on {SITE.name} can email <Contact />. It helps to include the page address, what went wrong,
          and the browser or assistive tool in use. {SITE.name} replies within five business days with a fix or a workaround, and
          adds the problem to the list above if it cannot be fixed straight away.
        </p>
      </>
    ),
  },
  {
    id: "byhand",
    heading: "Doing it by hand",
    body: (
      <p>
        Nothing on {SITE.name} has to be done on the site. Anyone who cannot create a fundraiser, buy a sponsorship, make a backing or read a record
        because of an accessibility barrier can email <Contact />, and {SITE.name} will do it with them by email or by phone.
      </p>
    ),
  },
];

export default function AccessibilityPage() {
  return (
    <LegalPage
      path="/accessibility"
      eyebrow="House paper"
      title="Accessibility"
      accent="statement"
      intro={
        <p>
          {SITE.name} wants every organizer, sponsor, patron and fan to be able to use the site. This page says what that means in
          practice, where the site falls short, and how to report a problem.
        </p>
      }
      stamp={
        <>
          OPEN<br />TO<br />ALL
        </>
      }
      updated={UPDATED}
      sections={SECTIONS}
    />
  );
}
