"use client";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { signUp, type SignUpState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import type { Intent } from "@/lib/intent";
import {
  PASSWORD_MIN,
  SIGNUP_FIELDS,
  errorId,
  firstInvalid,
  validateField,
  validateSignUp,
  type SignUpErrors,
  type SignUpField,
  type SignUpValues,
} from "@/lib/signup";

const initial: SignUpState = { ok: false };

const labelClass = "caps mb-2 block text-[14px] text-ink";
const helpClass = "mt-2 text-[14px] leading-[1.5] text-muted";

/**
 * The `field` utility in globals.css carries the border, the focus ring and the invalid state, the
 * last of it driven by aria-invalid so what a screen reader is told and what the eye sees cannot
 * drift apart. src/lib/signup.ts holds the rules that decide which it is.
 */
const fieldClass = "field w-full bg-ground px-3.5 py-3 text-[15px] text-ink";

/**
 * Opens an account. Two questions: how to reach the person, and a password.
 *
 * Nobody picks a side to get in, because every account can create fundraisers and support them.
 * No fundraiser address is asked for; an organizer picks that on the organizer page, which is the
 * moment it means anything. No name either: both are optional in the data model and on the server
 * (SignUpInput sends an empty one through as no name at all), so they are asked for once, on the
 * account page, rather than standing between somebody and an account.
 *
 * `intent` is carried through untouched. It only decides which action the dashboard leads with
 * afterwards, so a form that never received one still works the same way.
 *
 * The fields are controlled rather than left to the DOM. React resets an uncontrolled form once
 * its action settles, which would empty every box behind a failed submission, and holding the
 * values is also what lets an error clear the instant it stops being true.
 */
export function SignUpForm({ next, intent }: { next: string; intent?: Intent | null }) {
  const [state, action, pending] = useActionState(signUp, initial);

  // The names stay in the shape the shared rules are written against, and stay empty: this form
  // no longer asks for them, and the server reads an empty one as no name.
  const [values, setValues] = useState<SignUpValues>({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const focusField = useCallback((f: SignUpField) => {
    const el = f === "email" ? emailRef.current : f === "password" ? passwordRef.current : null;
    el?.focus();
  }, []);

  /*
    The server has the last word, and its answer arrives as a new state object rather than as a
    prop change. Adopting it while rendering is React's own way of reacting to that: an effect
    would render once with the stale messages and then again with the real ones.
  */
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    const returned = state.errors;
    if (returned) {
      const { form, ...fields } = returned;
      setErrors(fields);
      setFormError(form ?? null);
      setBlocked(Object.keys(fields).length > 0);
    }
  }

  // Focus is a change to the document, not to state, so it stays in an effect. The ref remembers
  // which answer has already been acted on, so a later render does not steal the cursor back.
  const focusedFor = useRef<SignUpState | null>(null);
  useEffect(() => {
    if (focusedFor.current === state) return;
    focusedFor.current = state;
    if (!state.errors) return;
    const { form, ...fields } = state.errors;
    void form;
    const target = firstInvalid(fields);
    if (target) focusField(target);
  }, [state, focusField]);

  /** Typing into a field that is already wrong clears the message as soon as it is right. */
  const revalidate = (patch: Partial<SignUpValues>) => {
    setValues((prev) => {
      const nextValues = { ...prev, ...patch } as SignUpValues;
      setErrors((prevErrors) => {
        let changed = false;
        const cleared = { ...prevErrors };
        for (const key of Object.keys(patch) as SignUpField[]) {
          if (cleared[key] && !validateField(key, nextValues)) {
            delete cleared[key];
            changed = true;
          }
        }
        return changed ? cleared : prevErrors;
      });
      return nextValues;
    });
  };

  /**
   * Nothing is sent while the page can already see what is wrong. The action still runs the same
   * checks on the server; this only saves a round trip and keeps the answer next to the control.
   */
  const guard = (e: React.FormEvent<HTMLFormElement>) => {
    const found = validateSignUp(values);
    if (Object.keys(found).length === 0) {
      setBlocked(false);
      setFormError(null);
      return;
    }
    e.preventDefault();
    setErrors(found);
    setFormError(null);
    setBlocked(true);
    const target = firstInvalid(found);
    if (target) focusField(target);
  };

  if (state.ok && state.confirm) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">LINK<br />SENT</Stamp>
        <h2 className="heading text-[clamp(24px,3.2vw,30px)] leading-[1.1]">Check your inbox</h2>
        <p className="mx-auto mt-3 max-w-none">We sent a confirmation link to {state.email}.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[14.5px] leading-[1.6] text-muted">
          The link expires after a short time. Check your spam folder if it does not arrive.
        </p>
        <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
          <Link href="/login" className="text-accent-ink underline underline-offset-4">Back to sign in</Link>
        </p>
      </div>
    );
  }

  /*
    The banner is up while the server has something to say, or while a submission is being held
    back and there is still something to hold it back for. Fixing the last field takes it down
    with the field messages rather than leaving a warning about nothing.

    It carries the actual problems, not a note that there are some. Several of the server's answers
    belong to a single field rather than to the form: an address that already has an account is the
    common one. Those used to arrive here as "something above needs another look", which put a
    vague line where the eye lands and left the real sentence further down the page, next to a
    field somebody had already filled in correctly as far as they knew.
  */
  const fieldMessages = SIGNUP_FIELDS.map((f) => errors[f]).filter((msg): msg is string => Boolean(msg));
  const showBanner = Boolean(formError) || (blocked && fieldMessages.length > 0);
  const lead = formError ?? (fieldMessages.length === 1 ? fieldMessages[0] : "There is a problem with the form.");

  const describedBy = (f: SignUpField, help?: string) =>
    [errors[f] ? errorId(f) : null, help ?? null].filter(Boolean).join(" ") || undefined;

  return (
    <form action={action} onSubmit={guard} noValidate>
      <input type="hidden" name="next" value={next} />
      {/* Carried, not trusted: the action parses it again and drops anything it does not know. */}
      {intent && <input type="hidden" name="intent" value={intent} />}

      {/*
        One alert, at the top, for anything that is not attached to a single control: what the
        server refused, or the fact that a submission was held back. The field messages below are
        reached through aria-describedby when focus lands on their control, so nothing is read out
        twice.
      */}
      <div role="alert" aria-live="assertive">
        {showBanner && (
          <div
            id={errorId("form")}
            className="mb-[22px] border-2 border-accent-ink bg-accent/10 px-4 py-3 text-[14.5px] leading-[1.5] text-ink"
          >
            <p className="flex items-start gap-2.5">
              <Bang />
              <span>{lead}</span>
            </p>
            {!formError && fieldMessages.length > 1 && (
              <ul className="mt-2 grid list-disc gap-1 pl-[46px]">
                {fieldMessages.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mb-[18px]">
        <label htmlFor="signup-email" className={labelClass}>Email</label>
        <input
          ref={emailRef}
          id="signup-email"
          name="email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(e) => revalidate({ email: e.target.value })}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy("email")}
          className={fieldClass}
        />
        {errors.email && <FieldError id={errorId("email")}>{errors.email}</FieldError>}
      </div>

      <label htmlFor="signup-password" className={labelClass}>Password</label>
      <div className="relative">
        <input
          ref={passwordRef}
          id="signup-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          value={values.password}
          onChange={(e) => revalidate({ password: e.target.value })}
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy("password", "signup-password-help")}
          className={`${fieldClass} pr-[86px]`}
        />
        {/*
          The button's name is the whole state: "Show password" while it is hidden, "Hide password"
          while it is not. Nothing but the input's type changes, so a password manager still sees
          the same field with the same name and autocomplete.
        */}
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-controls="signup-password"
          className="caps absolute right-0 top-0 h-full cursor-pointer px-3.5 text-[14px] text-accent-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/70"
        >
          {showPassword ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
      {errors.password && <FieldError id={errorId("password")}>{errors.password}</FieldError>}
      <p id="signup-password-help" className={`${helpClass} mb-[22px]`}>Use at least {PASSWORD_MIN} characters.</p>

      {/*
        Off to start with, and ticked by whoever wants it. Nothing is sent to an address that did
        not ask, and the account page turns it on or off at any time afterwards. Every send carries
        its own link to stop it, which is the unsubscribe path and is unchanged.
      */}
      <label className="mb-[22px] flex cursor-pointer items-start gap-3 text-[14.5px] leading-[1.6] text-muted">
        <input type="checkbox" name="newsletter" className="mt-0.5 h-4 w-4 flex-none accent-[var(--accent)]" />
        <span>Email me about new fundraisers.</span>
      </label>

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="mt-4 text-[14px] leading-[1.6] text-muted">
        By creating an account, you agree to the{" "}
        <Link href="/terms" className="text-accent-ink underline underline-offset-4">Terms</Link> and{" "}
        <Link href="/privacy" className="text-accent-ink underline underline-offset-4">Privacy Policy</Link>.
      </p>

      <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
        Already have an account? <Link href="/login" className="text-accent-ink underline underline-offset-4">Sign in</Link>.
      </p>
    </form>
  );
}

/** The glyph in front of every error. A shape, so the state does not rest on the color alone. */
function Bang() {
  return (
    <span
      aria-hidden="true"
      className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center border border-accent-ink text-[12px] font-bold leading-none text-accent-ink"
    >
      !
    </span>
  );
}

function FieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 flex items-start gap-2 text-[14.5px] leading-[1.5] text-ink">
      <Bang />
      <span>{children}</span>
    </p>
  );
}
