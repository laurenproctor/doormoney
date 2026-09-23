"use client";
import { useActionState, useId } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { NEWSLETTER } from "@/lib/newsletter-copy";
import { subscribeNewsletter, type NewsletterState } from "@/app/actions/newsletter";

const initial: NewsletterState = { ok: false };

/*
  A first name, an address and a button: the new-fundraisers email.

  Both fields are needed, because the email opens by name, and both now carry a label somebody can
  read rather than a placeholder that leaves as soon as they type. A placeholder is not a label: it
  disappears exactly when a person wants to check what they are filling in, and it is the first
  thing a screen magnifier loses. The label stays, the required mark is a word as well as a symbol,
  and the button says what arrives rather than what it does to the database.

  One layout, in a panel, on every surface that asks: the band on the marketing pages and the block
  in the footer are now the same form, so an improvement here is an improvement everywhere.
*/

const labelClass = "mb-2 block text-[14px] font-medium text-ink";
const fieldClass = "field w-full bg-ground px-3.5 py-3 text-[15px] text-ink placeholder:text-muted";

export function NewsletterForm({ source }: { source: string }) {
  const [state, action, pending] = useActionState(subscribeNewsletter, initial);
  const id = useId();
  const pathname = usePathname();
  // The footer form sits on every page; record which one.
  const from = source === "footer" ? `footer:${pathname}` : source;
  const errorId = `${id}-error`;
  const invalid = state.error ? true : undefined;
  const describedBy = state.error ? errorId : undefined;

  if (state.ok) {
    return (
      <div role="status" className="flex items-center gap-6">
        <Stamp className="max-sm:hidden">
          FIRST
          <br />
          TO
          <br />
          HEAR
        </Stamp>
        <p className="max-w-[32ch] text-[15px] leading-[1.6]">
          Done. The next new fundraiser arrives by email the week it opens.
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate>
      <input type="hidden" name="source" value={from} />
      {/* Honeypot: off screen, out of the tab order, ignored by readers. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* Two fields, side by side where there is room and stacked where there is not. */}
      <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-first-name`} className={labelClass}>
            First name <Required />
          </label>
          <input
            id={`${id}-first-name`}
            name="first_name"
            type="text"
            autoComplete="given-name"
            placeholder="Your first name"
            required
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor={`${id}-email`} className={labelClass}>
            Email address <Required />
          </label>
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            aria-invalid={invalid}
            aria-describedby={describedBy}
            className={fieldClass}
          />
        </div>
      </div>

      {/* The legend explains the mark and is not itself a required field, so it carries no
          second "(required)" for a screen reader: the labels above already say it in words. */}
      <p className="mt-4 text-[14px] text-muted">
        <span aria-hidden="true" className="text-accent-ink">*</span> Required
      </p>

      {state.error && (
        <p id={errorId} role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {state.error}
        </p>
      )}

      {/* The one thing to press, the width of the block it closes. */}
      <Button type="submit" disabled={pending} className="mt-4 w-full">
        {pending ? "One second" : "Email me new fundraisers"}
      </Button>

      <p className="mt-4 text-[14px] leading-[1.6] text-muted">{NEWSLETTER.fine}</p>
    </form>
  );
}

/** The required mark. The accent carries it, and the word beside the fields says what it means. */
function Required() {
  return (
    <span className="text-accent-ink">
      <span aria-hidden="true">*</span>
      <span className="sr-only">(required)</span>
    </span>
  );
}
