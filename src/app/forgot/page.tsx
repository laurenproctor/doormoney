import type { Metadata } from "next";
import Link from "next/link";
import { Eyebrow } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { Logo } from "@/components/Logo";
import { Theme } from "@/components/Theme";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

/*
  Password recovery.

  Composed here rather than in the shared Page shell. That shell brings the marketing nav, a hero
  with a strap line and a scroll arrow, and a footer carrying the newsletter, all of which sat in
  front of somebody who is locked out and wants one field. The header and footer below are local to
  this route on purpose: the shared ones keep their own behavior for every other page.

  The photograph is the same blue-treated one the rest of the auth pages carry, through the shared
  HeroArt, which reads public/hero/blue.jpg from the theme name.
*/

export const metadata: Metadata = {
  title: { absolute: "Reset your password | Door Money" },
  description: "Request a secure link to reset your Door Money password.",
  // The convention on the other account pages: /reset carries the same.
  robots: { index: false },
};

const FOOTER_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/accessibility", label: "Accessibility" },
  { href: "/contact", label: "Contact" },
] as const;

export default function ForgotPage() {
  return (
    <Theme name="blue">
      <a
        href="#form"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to the form
      </a>

      {/* Two links and nothing else: the way home, and the way back to signing in. */}
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-6 py-5">
          <Link href="/" aria-label="Door Money, home" className="inline-flex min-h-[44px] items-center text-ink no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink">
            <Logo title="" className="h-[32px] w-auto" />
          </Link>
          <Link
            href="/login"
            className="caps inline-flex min-h-[44px] items-center px-1 text-[14px] text-muted no-underline outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Back to sign in
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/*
          The form is first in the document, so it is what a phone shows and what the keyboard
          reaches first. From lg the picture takes the column beside it.
        */}
        <div className="mx-auto grid w-full max-w-[1120px] items-start gap-8 px-6 py-12 lg:grid-cols-[1fr_minmax(0,520px)] lg:gap-14 lg:py-16">
          {/* Stacked, the column keeps a reading measure rather than running the field to both edges. */}
          <div id="form" className="w-full max-lg:mx-auto max-lg:max-w-[520px] lg:col-start-2 lg:row-start-1">
            <Eyebrow className="mb-6">Account recovery</Eyebrow>
            <h1 className="display max-w-[14ch] text-[clamp(30px,6.2vw,52px)] leading-[1.02]">
              Reset your <em className="text-accent-ink">password</em>
            </h1>
            <p className="mt-5 max-w-[46ch] text-[clamp(15px,1.8vw,17px)] leading-[1.55]">
              Enter the email address or username you use for Door Money. We&rsquo;ll send a secure link so you
              can choose a new password.
            </p>
            <div className="edge glow mt-8 bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] p-7 max-md:p-6">
              <ForgotPasswordForm />
            </div>
          </div>

          <div
            aria-hidden="true"
            className="relative min-h-[200px] overflow-hidden border border-line lg:col-start-1 lg:row-start-1 lg:min-h-[560px]"
          >
            <HeroArt theme="blue" />
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <nav aria-label="Site information" className="mx-auto flex w-full max-w-[1120px] flex-wrap gap-x-7 gap-y-1 px-6 py-6">
          {FOOTER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="caps inline-flex min-h-[44px] items-center text-[14px] text-muted no-underline outline-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </footer>
    </Theme>
  );
}
