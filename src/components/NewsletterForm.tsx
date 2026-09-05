"use client";
import { useActionState, useId } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { subscribeNewsletter, type NewsletterState } from "@/app/actions/newsletter";

const initial: NewsletterState = { ok: false };

/**
 * A first name, an address and a button: the new-boards email. Both fields are required, so the
 * email can open by name. `source` records which page the address came from. `compact` is the
 * footer strip, which keeps the two fields and the button on one row where there is space.
 */
export function NewsletterForm({ source, compact = false }: { source: string; compact?: boolean }) {
  const [state, action, pending] = useActionState(subscribeNewsletter, initial);
  const id = useId();
  const pathname = usePathname();
  // The footer strip sits on every page; record which one.
  const from = source === "footer" ? `footer:${pathname}` : source;

  if (state.ok) {
    return compact ? (
      <p role="status" className="caps text-[14px] text-accent-ink">Done. The next new board arrives by email the week it opens.</p>
    ) : (
      <div role="status" className="flex items-center gap-6">
        <Stamp>FIRST<br />TO<br />HEAR</Stamp>
        <p className="max-w-[32ch]">Done. The next new board arrives by email the week it opens.</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="grid gap-2">
      <input type="hidden" name="source" value={from} />
      {/* Honeypot: off screen, out of the tab order, ignored by readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-wrap gap-2.5">
        <label htmlFor={`${id}-first-name`} className="sr-only">First name</label>
        <input
          id={`${id}-first-name`}
          name="first_name"
          type="text"
          autoComplete="given-name"
          placeholder="First name"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={`field min-w-[140px] flex-1 bg-panel px-3.5 text-[15px] ${compact ? "py-2.5" : "py-3"}`}
        />
        <label htmlFor={`${id}-email`} className="sr-only">Email</label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          required
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className={`field min-w-[200px] flex-1 bg-panel px-3.5 text-[15px] ${compact ? "py-2.5" : "py-3"}`}
        />
        <Button type="submit" variant={compact ? "ghost" : "solid"} disabled={pending} className={compact ? "px-5 py-2.5" : ""}>
          {pending ? "One second" : "Get the newsletter"}
        </Button>
      </div>
      {state.error && (
        <p id={`${id}-error`} className="text-[14.5px] text-accent-ink">{state.error}</p>
      )}
    </form>
  );
}
