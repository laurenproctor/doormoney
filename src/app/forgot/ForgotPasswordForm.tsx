"use client";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { requestPasswordReset, type ResetState } from "@/app/actions/auth";
import { Button, ButtonLink } from "@/components/Button";
import { Eyebrow } from "@/components/Brand";
import { EMPTY_MESSAGE, ERROR_ID, FIELD_ID, HINT_ID, SERVICE_MESSAGE, describedBy, isBlankHandle } from "./validate";

/**
 * What the page shows, which is the action's own answer plus the one thing the action cannot
 * report: that the call never completed.
 */
type ForgotState = ResetState;

const initial: ForgotState = { ok: false };

/**
 * The action, wrapped so a dropped connection is a message rather than a blank page.
 *
 * `requestPasswordReset` is called unchanged, with the same FormData and the same `handle` field.
 * A server action that rejects escapes to the nearest error boundary, which on this route meant
 * the reader lost the page and what they had typed at the exact moment they were already having
 * trouble getting in. Catching it here keeps the form and the value on screen.
 *
 * This says nothing about the account. The action answers the same way whoever asks, and a
 * transport failure knows even less than the action does.
 */
async function submitReset(_prev: ForgotState, form: FormData): Promise<ForgotState> {
  try {
    return await requestPasswordReset({ ok: false }, form);
  } catch {
    return { ok: false, error: SERVICE_MESSAGE };
  }
}

/**
 * The recovery form, local to /forgot.
 *
 * It calls `requestPasswordReset` unchanged: same server action, same `handle` field, same answer.
 * That action reports the same thing whether or not an account matches, so this component must
 * never say anything that would distinguish the two. The confirmation below is written to be true
 * either way.
 *
 * The shared `ForgotForm` in src/components/PasswordForms.tsx is untouched, because /reset and the
 * account page take their own forms from that file.
 */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(submitReset, initial);
  const [handle, setHandle] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [again, setAgain] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  /*
    A fresh answer from the server ends any "try another" the reader had asked for. Adopting it
    while rendering rather than in an effect keeps the form from flashing the confirmation for the
    previous submission while the next one is still in flight.
  */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    setAgain(false);
  }

  const sent = state.ok && !again;
  // The action's own message is the fallback for a submission that reached it without JavaScript.
  const error = clientError ?? (state.ok ? null : (state.error ?? null));

  useEffect(() => {
    if (sent) doneRef.current?.focus();
  }, [sent]);

  if (sent) {
    return (
      <div role="status" aria-live="polite">
        <Eyebrow className="mb-6">Email sent</Eyebrow>
        <h2 ref={doneRef} tabIndex={-1} className="heading text-[clamp(26px,3.4vw,34px)] leading-[1.1] outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-ink">
          Check your inbox
        </h2>
        <p className="mt-5 text-[15px] leading-[1.6]">
          If an account matches those details, we&rsquo;ve sent a password-reset link. It can be used once and
          expires after one hour.
        </p>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-muted">
          If it does not arrive within a few minutes, check your spam folder or try another email address or
          username.
        </p>
        <div className="mt-8 grid gap-3">
          <ButtonLink href="/login" className="w-full">Back to sign in</ButtonLink>
          <button
            type="button"
            onClick={() => {
              setAgain(true);
              setHandle("");
              setClientError(null);
              // The field is back on the next paint, so wait for it before reaching for it.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            className="caps w-full cursor-pointer border border-ink/40 bg-transparent px-7 py-4 text-[14px] tracking-[0.16em] text-ink outline-none transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Try another email or username
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      action={action}
      aria-busy={pending}
      noValidate
      onSubmit={(e) => {
        // Nothing reaches the reset service on an empty submission, and nothing goes twice.
        if (pending) {
          e.preventDefault();
          return;
        }
        if (isBlankHandle(handle)) {
          e.preventDefault();
          setClientError(EMPTY_MESSAGE);
          inputRef.current?.focus();
          return;
        }
        setClientError(null);
      }}
    >
      <label htmlFor={FIELD_ID} className="caps mb-2 block text-[14px] text-ink">
        Email address or username
      </label>
      <input
        ref={inputRef}
        id={FIELD_ID}
        name="handle"
        type="text"
        value={handle}
        onChange={(e) => {
          setHandle(e.target.value);
          if (clientError && !isBlankHandle(e.target.value)) setClientError(null);
        }}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        readOnly={pending}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(Boolean(error))}
        className="field w-full bg-ground px-3.5 py-3 text-[15px] text-ink"
      />
      {error && (
        <p id={ERROR_ID} role="alert" className="mt-2 flex items-start gap-2 text-[14.5px] leading-[1.5] text-ink">
          <span
            aria-hidden="true"
            className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center border border-accent-ink text-[12px] font-bold leading-none text-accent-ink"
          >
            !
          </span>
          <span>{error}</span>
        </p>
      )}
      <p id={HINT_ID} className="mt-2 text-[14px] leading-[1.5] text-muted">
        The link can be used once and expires after one hour.
      </p>

      <Button type="submit" disabled={pending} className="mt-7 w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>

      <p className="mt-6 border-t border-line pt-5 text-[14.5px] leading-[1.6] text-muted">
        Remember your password?{" "}
        <Link href="/login" className="text-accent-ink underline underline-offset-4">Sign in</Link>.
      </p>
      <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">
        Still can&rsquo;t get in?{" "}
        <Link href="/contact" className="text-accent-ink underline underline-offset-4">Contact us</Link>.
      </p>
    </form>
  );
}
