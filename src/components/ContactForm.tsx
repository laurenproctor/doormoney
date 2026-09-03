"use client";
import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { sendContactNote, type ContactField, type ContactState } from "@/app/actions/contact";
import { CONTACT_REASONS } from "@/lib/contact";

const initial: ContactState = { ok: false };

const inputClass = "typewriter hard-border w-full bg-paper px-3.5 py-3 text-[15px] focus:shadow-[4px_4px_0_var(--black)]";

/**
 * The form on /contact. It records when it mounted and sends that along; the action rejects
 * submissions that arrive implausibly fast after it. No cookies, nothing stored in the browser.
 */
export function ContactForm() {
  const [state, action, pending] = useActionState(sendContactNote, initial);
  const startedAt = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (startedAt.current) startedAt.current.value = String(Date.now());
  }, []);
  const id = useId();
  const fieldId = (f: ContactField) => `${id}-${f}`;
  const errorId = (f: ContactField) => `${id}-${f}-error`;
  const errors = state.errors ?? {};
  // After a failed submit React has reset the form, so the echoed values become the new defaults.
  const v = state.values;
  const fieldErrors = (Object.keys(errors) as (ContactField | "form")[]).filter((k) => k !== "form" && errors[k]);

  if (state.ok) {
    return (
      <div role="status" className="hard-border hard-shadow bg-cream px-7 pb-8 pt-9 text-center">
        <Stamp size="lg" className="mx-auto mb-5">
          NOTE<br />RECEIVED
        </Stamp>
        <p className="typewriter mx-auto max-w-[40ch] text-[16px]">The note reached Door Money. A reply will follow when one is useful.</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate className="grid gap-[18px]">
      <input ref={startedAt} type="hidden" name="started_at" defaultValue={v?.started_at ?? ""} />

      {/* Honeypot. Off screen, out of the tab order, ignored by assistive tools. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${id}-website`}>Leave this field empty</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <Field label="Reason for contacting Door Money" id={fieldId("reason")} errorId={errorId("reason")} error={errors.reason}>
        <select
          id={fieldId("reason")}
          name="reason"
          required
          defaultValue={v?.reason ?? ""}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? errorId("reason") : undefined}
          className={`${inputClass} cursor-pointer`}
        >
          <option value="" disabled>
            Pick the closest reason
          </option>
          {CONTACT_REASONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-[18px] sm:grid-cols-2">
        <Field label="Name" id={fieldId("name")} errorId={errorId("name")} error={errors.name}>
          <input
            id={fieldId("name")}
            name="name"
            defaultValue={v?.name}
            type="text"
            required
            maxLength={100}
            autoComplete="name"
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? errorId("name") : undefined}
            className={inputClass}
          />
        </Field>
        <Field
          label="Act, business, venue, or publication"
          hint="Optional"
          id={fieldId("organization")}
          errorId={errorId("organization")}
          error={errors.organization}
        >
          <input
            id={fieldId("organization")}
            name="organization"
            defaultValue={v?.organization}
            type="text"
            maxLength={160}
            autoComplete="organization"
            aria-invalid={errors.organization ? true : undefined}
            aria-describedby={errors.organization ? errorId("organization") : undefined}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Email" id={fieldId("email")} errorId={errorId("email")} error={errors.email}>
        <input
          id={fieldId("email")}
          name="email"
          defaultValue={v?.email}
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? errorId("email") : undefined}
          className={inputClass}
        />
      </Field>

      <Field label="Subject" id={fieldId("subject")} errorId={errorId("subject")} error={errors.subject}>
        <input
          id={fieldId("subject")}
          name="subject"
          defaultValue={v?.subject}
          type="text"
          required
          minLength={3}
          maxLength={160}
          autoComplete="off"
          aria-invalid={errors.subject ? true : undefined}
          aria-describedby={errors.subject ? errorId("subject") : undefined}
          className={inputClass}
        />
      </Field>

      <Field label="Message" id={fieldId("message")} errorId={errorId("message")} error={errors.message}>
        <textarea
          id={fieldId("message")}
          name="message"
          defaultValue={v?.message}
          required
          minLength={20}
          maxLength={5000}
          rows={8}
          autoComplete="off"
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={errors.message ? errorId("message") : undefined}
          className={`${inputClass} min-h-[200px] resize-y leading-[1.6]`}
        />
      </Field>

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} aria-disabled={pending}>
          {pending ? "Sending" : "Send the note"}
        </Button>
        <p className="typewriter text-[13px] text-gray">Door Money stores the note and answers from a real inbox.</p>
      </div>

      {/* Submission feedback. Announced to assistive tools as it changes. */}
      <div aria-live="polite" aria-atomic="true">
        {errors.form && <p className="typewriter text-[13.5px] text-red">{errors.form}</p>}
        {!errors.form && fieldErrors.length > 0 && (
          <p className="typewriter text-[13.5px] text-red">
            {fieldErrors.length === 1 ? "One field needs attention." : `${fieldErrors.length} fields need attention.`}
          </p>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  id,
  errorId,
  error,
  children,
}: {
  label: string;
  hint?: string;
  id: string;
  errorId: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="poster mb-1.5 block text-[15px] tracking-[0.04em]">
        {label}
        {hint && <span className="typewriter ml-2 text-[12.5px] normal-case tracking-normal text-gray">{hint}</span>}
      </label>
      {children}
      {error && (
        <p id={errorId} className="typewriter mt-1.5 text-[13px] text-red">
          {error}
        </p>
      )}
    </div>
  );
}
