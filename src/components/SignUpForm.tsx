"use client";
import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { signUp, type SignUpState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { ROLES } from "@/lib/roles";
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
 * Opens an account.
 *
 * Two questions and nothing else: what the person came here to do, and how to reach them. Both
 * answers can be both, and either can change later. No fundraiser address is asked for here; a
 * musician picks that when they list the act, which is the moment it means anything.
 *
 * The fields are controlled rather than left to the DOM. React resets an uncontrolled form once
 * its action settles, which would empty every box behind a failed submission, and holding the
 * values is also what lets an error clear the instant it stops being true.
 */
export function SignUpForm({ next, fixedRoles, submitLabel }: { next: string; fixedRoles?: readonly string[]; submitLabel?: string }) {
  const [state, action, pending] = useActionState(signUp, initial);

  const [values, setValues] = useState<SignUpValues>({
    roles: fixedRoles ?? [],
    first_name: "",
    last_name: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<SignUpErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const rolesRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const lastNameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const focusField = useCallback((f: SignUpField) => {
    const el =
      f === "roles" ? rolesRef.current
      : f === "first_name" ? firstNameRef.current
      : f === "last_name" ? lastNameRef.current
      : f === "email" ? emailRef.current
      : passwordRef.current;
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

  const toggleRole = (key: string, on: boolean) =>
    revalidate({ roles: on ? [...values.roles, key] : values.roles.filter((r) => r !== key) });

  /**
   * Nothing is sent while the page can already see what is wrong. The action still runs the same
   * checks on the server; this only saves a round trip and keeps the answer next to the control.
   */
  const guard = (e: React.FormEvent<HTMLFormElement>) => {
    const found = fixedRoles ? omitRoles(validateSignUp(values)) : validateSignUp(values);
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
        <Stamp size="lg" className="mx-auto mb-[18px]">CHECK<br />THE<br />INBOX</Stamp>
        <p className="mx-auto max-w-none">A confirmation link is on its way to {state.email}.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-muted">
          One tap opens the account. Check the spam folder if it takes more than a minute.
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

      {/* A patron arriving through their own door has already answered the question, so the page
          does not ask it again. The role rides along as it would have from the checkboxes. */}
      {fixedRoles?.map((r) => <input key={r} type="hidden" name="roles" value={r} />)}

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

      {!fixedRoles && (
      <fieldset className="mb-[22px]">
        <legend className={labelClass}>How will you use Door Money?</legend>
        <div className="grid gap-3">
          {ROLES.map((r, i) => {
            const on = values.roles.includes(r.key);
            return (
              <label
                key={r.key}
                className={`grid cursor-pointer grid-cols-[26px_1fr] items-start gap-3.5 p-3.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-ink/70 ${
                  on ? "border-2 border-accent bg-accent/15" : errors.roles ? "border-2 border-accent-ink" : "border border-line bg-ground"
                }`}
              >
                <input
                  ref={i === 0 ? rolesRef : undefined}
                  type="checkbox"
                  name="roles"
                  value={r.key}
                  checked={on}
                  onChange={(e) => toggleRole(r.key, e.target.checked)}
                  aria-invalid={errors.roles ? true : undefined}
                  aria-describedby={describedBy("roles", "signup-roles-help")}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border text-[16px] leading-none ${
                    on ? "border-accent bg-accent text-on-accent" : "border-line text-transparent"
                  }`}
                >
                  &#10003;
                </span>
                <span className="min-w-0">
                  <b className="block text-[16px] font-medium">{r.label}</b>
                  <span className="block text-[14.5px] leading-[1.5] text-muted">{r.blurb}</span>
                </span>
              </label>
            );
          })}
        </div>
        <p id="signup-roles-help" className={helpClass}>Choose one or both. You can change this later.</p>
        {errors.roles && <FieldError id={errorId("roles")}>{errors.roles}</FieldError>}
      </fieldset>
      )}

      <div className="grid gap-x-5 sm:grid-cols-2">
        <div>
          <label htmlFor="signup-first-name" className={labelClass}>First name</label>
          <input
            ref={firstNameRef}
            id="signup-first-name"
            name="first_name"
            type="text"
            autoComplete="given-name"
            value={values.first_name}
            onChange={(e) => revalidate({ first_name: e.target.value })}
            aria-invalid={errors.first_name ? true : undefined}
            aria-describedby={describedBy("first_name", "signup-name-help")}
            className={fieldClass}
          />
          {errors.first_name && <FieldError id={errorId("first_name")}>{errors.first_name}</FieldError>}
        </div>
        <div className="max-sm:mt-[18px]">
          <label htmlFor="signup-last-name" className={labelClass}>Last name</label>
          <input
            ref={lastNameRef}
            id="signup-last-name"
            name="last_name"
            type="text"
            autoComplete="family-name"
            value={values.last_name}
            onChange={(e) => revalidate({ last_name: e.target.value })}
            aria-invalid={errors.last_name ? true : undefined}
            aria-describedby={describedBy("last_name", "signup-name-help")}
            className={fieldClass}
          />
          {errors.last_name && <FieldError id={errorId("last_name")}>{errors.last_name}</FieldError>}
        </div>
      </div>
      <p id="signup-name-help" className={`${helpClass} mb-[18px]`}>
        The person holding the account. A band or a business gets its own name later, and nothing here
        appears publicly unless it is put on a page on purpose.
      </p>

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
        aria-describedby={describedBy("email", "signup-email-help")}
        className={fieldClass}
      />
      {errors.email && <FieldError id={errorId("email")}>{errors.email}</FieldError>}
      <p id="signup-email-help" className={`${helpClass} mb-[18px]`}>Used for account notices, receipts and payout updates.</p>

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

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "One second" : (submitLabel ?? "Create free account")}
      </Button>

      <p className="mt-4 text-[14px] leading-[1.6] text-muted">
        By creating an account, you agree to the{" "}
        <Link href="/terms" className="text-accent-ink underline underline-offset-4">Terms and Conditions</Link> and{" "}
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

/** The patron door answers the role question by existing, so its errors never mention roles. */
function omitRoles(errors: SignUpErrors): SignUpErrors {
  const { roles, ...rest } = errors;
  void roles;
  return rest;
}
