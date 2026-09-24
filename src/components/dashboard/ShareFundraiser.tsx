"use client";
import { useState } from "react";
import { Copy } from "@/components/dashboard/icons";

/**
 * Copies the fundraiser's public address.
 *
 * Only rendered for a published fundraiser: a draft has no address a patron could open, and
 * handing somebody a link to a 404 is worse than not offering to. The result is announced rather
 * than only shown, because the button's own label does not change.
 *
 * It lives in the Share panel on the fundraiser's own page, which is the Desk register, so it is
 * the register's own control: sentence case, 36px, a 6px corner (docs/DESK_REGISTER.md).
 */
export function ShareFundraiser({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [said, setSaid] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setSaid("Link copied to the clipboard.");
          } catch {
            setSaid("Could not copy. The address is on the fundraiser page.");
          }
        }}
        className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-control border border-field-line px-3.5 text-[14px] font-medium text-ink outline-none transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
      >
        <Copy size={14} aria-hidden="true" />
        {label}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {said}
      </span>
    </>
  );
}
