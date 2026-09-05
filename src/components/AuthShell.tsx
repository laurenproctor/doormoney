import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/Logo";
import { Eyebrow } from "@/components/Brand";
import { Theme } from "@/components/Theme";

/**
 * The shell for signing up and signing in. No nav, no footer, nothing to click but the way in.
 *
 * Two columns on a wide screen: what an account is worth on the left, the form on the right.
 * On a phone the form comes first, because somebody who came here to sign in should not have to
 * scroll past the sales pitch to do it. The wordmark is the only way back out to the site.
 */
export function AuthShell({
  eyebrow,
  title,
  accent,
  intro,
  aside,
  children,
  panelClass = "bg-panel",
}: {
  eyebrow: string;
  title: string;
  accent: string;
  intro: ReactNode;
  /** The left column: what this account does for the person opening it. */
  aside: ReactNode;
  /** The right column: the form itself. */
  children: ReactNode;
  /**
   * The panel behind the form. Defaults to the translucent block every page uses. Sign-up passes
   * an opaque one, because a beam crossing behind a form changes what its labels are sitting on.
   */
  panelClass?: string;
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
          <Link href="/" aria-label="Door Money, home" className="inline-block text-ink no-underline">
            <Logo title="" className="h-[36px] w-auto" />
          </Link>

          {/*
            Three blocks, one grid. Below lg they stack in the order they are written: the heading
            names the page, the form is next because that is what the visitor came for, and the
            reasons sit under it. From lg the form moves to its own column and spans both rows, so
            the heading and the reasons read down the left.

            The second column waits for lg rather than md because 460px of it is fixed. At 768 that
            left 173px for the heading, less than a display H1's longest word, so the fixed track
            pushed the page sideways. It only showed on the pages with a long heading, which is why
            sign in looked fine while sign up did not.
          */}
          <div className="hero-in mt-12 grid items-start gap-x-[64px] gap-y-10 md:mt-16 lg:grid-cols-[1fr_460px]">
            <div className="lg:col-start-1 lg:row-start-1">
              <Eyebrow className="mb-7">{eyebrow}</Eyebrow>
              <h1 className="display max-w-[12ch] text-[clamp(40px,6.4vw,84px)] leading-[0.98]">
                {title} {accent && <em className="text-accent-ink">{accent}</em>}
              </h1>
              <div className="mt-7 max-w-[46ch] text-[clamp(16px,1.9vw,18px)] leading-[1.55]">{intro}</div>
            </div>

            <div id="form" className={`glow p-7 max-md:p-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 ${panelClass}`}>
              {children}
            </div>

            <div className="lg:col-start-1 lg:row-start-2">{aside}</div>
          </div>
        </div>
      </main>
    </Theme>
  );
}

/** The left column's list: one benefit a line, an accent tick in front of each. */
export function AuthPoints({ heading, points }: { heading: string; points: string[] }) {
  return (
    <>
      <h2 className="caps mb-4 text-[14px] text-accent-ink">{heading}</h2>
      <ul className="grid max-w-[46ch] gap-3.5">
        {points.map((p) => (
          <li key={p} className="grid grid-cols-[22px_1fr] items-start gap-3.5 text-[15px] leading-[1.5]">
            <span aria-hidden="true" className="mt-0.5 flex h-[22px] w-[22px] flex-none items-center justify-center border border-accent/70 text-[13px] leading-none text-accent-ink">
              &#10003;
            </span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
