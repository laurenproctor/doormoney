"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/Button";
import { Eyebrow } from "@/components/Brand";
import { SITE } from "@/lib/site";

/** Name of the cookie that records that the notice was accepted. Listed on /cookies; keep the two in step. */
export const NOTICE_COOKIE = "dm_cookies";
const ONE_YEAR = 60 * 60 * 24 * 365;

function accepted(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${NOTICE_COOKIE}=`));
}

// The cookie is the source of truth. Accepting writes it and tells every subscriber to re-read it.
const listeners = new Set<() => void>();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function accept() {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NOTICE_COOKIE}=1; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax${secure}`;
  listeners.forEach((fn) => fn());
}

/**
 * Cookie notice pinned to the bottom of every page except the embed, which
 * lives in a frame on other people's sites and sets no cookies of its own.
 * Renders nothing on the server and only appears once the browser has checked
 * the cookie, so a person who already accepted never sees it flash.
 */
export function CookieBanner() {
  const pathname = usePathname();
  // Server snapshot says "accepted" so the HTML never carries the banner and the first paint matches it.
  const done = useSyncExternalStore(subscribe, accepted, () => true);

  if (done || pathname.startsWith("/embed")) return null;

  return (
    <aside
      aria-label="Cookie notice"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground "
    >
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-8 gap-y-4 px-7 py-4 sm:py-5">
        <div className="flex min-w-0 flex-1 basis-[420px] flex-col items-start gap-3">
          <Eyebrow>Cookies</Eyebrow>
          <p className="max-w-[62ch] text-[15px] leading-[1.6]">
            {SITE.name} sets only the cookies it needs to keep a musician signed in, take a payment, and remember this notice.
            Page views are counted without cookies. No advertising, nothing that follows anyone around.{" "}
            <Link href="/cookies" className="underline decoration-1 underline-offset-4">
              Read the cookie policy
            </Link>
            .
          </p>
        </div>
        <Button type="button" onClick={accept} className="shrink-0">
          Accept
        </Button>
      </div>
    </aside>
  );
}
