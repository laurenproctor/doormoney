import Link from "next/link";
import { ModeToggle } from "@/components/ModeToggle";
import { NAV, SITE } from "@/lib/site";
import { Logo } from "@/components/Logo";
import { signedInAccount } from "@/lib/auth";
import { accountPhotoUrl } from "@/lib/accountPhotoUrl";
import { navAccountName } from "@/lib/nav-account";
import { initialsFor } from "@/lib/organizer-setup";

/**
 * The top bar: wordmark, the site's pages in the middle, and on the right either the way in (sign
 * in, create an account) or, for a visitor who is signed in, who they are: their photo or their
 * initials and their name, linking to their dashboard. The bar reads the session itself, so every
 * page that mounts it tells the truth about the visitor without being told.
 */
export async function Nav({ current }: { current?: string }) {
  const links = NAV.filter((n) => n.href !== "/list");
  const account = await signedInAccount();
  const photo = account ? await accountPhotoUrl(account.id) : null;
  const name = account ? navAccountName(account) : null;
  return (
    <header className="relative z-10 border-b border-line bg-ground shadow-[0_24px_48px_-30px_rgba(0,0,0,0.9)]">
      <a
        href="#main"
        className="caps sr-only bg-accent px-4 py-2 text-[14px] text-on-accent no-underline focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-3 px-7 py-5 max-md:gap-x-4">
        <Link href="/" aria-label={`${SITE.name}, home`} className="text-ink no-underline">
          <Logo title="" className="h-[40px] w-auto max-md:h-[32px]" />
        </Link>
        <nav aria-label="Main" className="flex flex-wrap gap-x-7 gap-y-2 max-md:order-last max-md:basis-full md:mx-auto">
          {links.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current === n.href ? "page" : undefined}
              className={`caps border-b pb-1 text-[14px] no-underline transition-colors hover:text-ink ${
                current === n.href ? "border-accent-line text-ink" : "border-transparent text-muted"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-5">
          {/* The house lights. Quiet, to the left of the account links, and on every page that
              carries the nav. The pages with no nav (sign in, sign up, the password flows) keep
              whichever room the reader already chose: the choice lives on <html>, not on a page. */}
          <ModeToggle />
          {name ? (
            <Link href="/dashboard" aria-label={`Your dashboard, signed in as ${name}`} className="flex items-center gap-2.5 text-ink no-underline transition-colors hover:text-accent-ink">
              {photo ? (
                // A plain img on purpose: the link is signed per view and next/image only fetches public paths.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" width={32} height={32} className="edge h-[32px] w-[32px] flex-none rounded-full object-cover" />
              ) : (
                <span aria-hidden="true" className="caps flex h-[32px] w-[32px] flex-none items-center justify-center rounded-full border border-field-line text-[14px] leading-none tracking-normal">
                  {initialsFor(name)}
                </span>
              )}
              <span className="caps max-w-[18ch] truncate text-[14px] max-md:hidden">{name}</span>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                aria-current={current === "/login" ? "page" : undefined}
                className={`caps text-[14px] no-underline transition-colors hover:text-ink max-md:hidden ${current === "/login" ? "text-ink" : "text-muted"}`}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="caps border border-field-line px-5 py-2.5 text-[14px] text-ink no-underline transition-colors hover:border-ink max-md:px-3.5"
              >
                Create an account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
