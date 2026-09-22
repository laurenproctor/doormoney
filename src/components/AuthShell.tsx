import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Eyebrow } from "@/components/Brand";
import { Theme } from "@/components/Theme";

/**
 * The shell behind every account door: sign up, sign in, the password flows and the two-factor
 * code. No nav, no footer, nothing to click but the way in.
 *
 * One column, centered, and short. It used to run two columns, with what an account is worth
 * beside the form. Somebody opening or reaching their own account was reading the product on the
 * way past, so what is left is a heading, one line of context, and the panel. The wordmark is the
 * only way back out to the site.
 */
export function AuthShell({
  eyebrow,
  title,
  accent,
  intro,
  support,
  children,
}: {
  eyebrow: string;
  title: string;
  /** The italic word that finishes the heading. Optional, for a heading that is one phrase. */
  accent?: string;
  intro: ReactNode;
  /** At most one short line under the intro. Anything longer belongs on a page somebody chose. */
  support?: string;
  /** The form itself. */
  children: ReactNode;
}) {
  return (
    <Theme name="blue">
      <a
        href="#form"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to the form
      </a>
      <main id="main" className="pool flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-7 pb-[72px] pt-8">
          <Link
            href="/"
            aria-label="Door Money, home"
            className="inline-flex min-h-[44px] items-center text-ink no-underline outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink"
          >
            <Logo title="" className="h-[36px] w-auto" />
          </Link>

          {/*
            One column at every width, so the phone layout and the desktop layout are the same
            layout. The measure is the form's: a heading wider than the panel under it reads as two
            things rather than one.
          */}
          <div className="hero-in mx-auto mt-10 w-full max-w-[520px] md:mt-14">
            <Eyebrow className="mb-6">{eyebrow}</Eyebrow>
            <h1 className="display text-[clamp(32px,5.4vw,52px)] leading-[1.02]">
              {title} {accent && <em className="text-accent-ink">{accent}</em>}
            </h1>
            <div className="mt-5 text-[clamp(15px,1.8vw,17px)] leading-[1.55]">{intro}</div>
            {support && <p className="mt-2.5 text-[14.5px] leading-[1.6] text-muted">{support}</p>}

            {/* Opaque, not translucent: a beam crossing behind a form changes what its labels sit on. */}
            <div
              id="form"
              className="edge glow mt-8 bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] p-7 max-md:p-6"
            >
              {children}
            </div>
          </div>
        </div>
      </main>
    </Theme>
  );
}
