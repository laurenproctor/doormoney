"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import type { ReactNode } from "react";
import { sendMagicLink, signIn, type LoginState, type PasswordState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { LOGIN_MESSAGES, isBlank } from "@/lib/login";

const linkInitial: LoginState = { ok: false };
const passwordInitial: PasswordState = {};

const fieldClass = "field w-full bg-ground px-3.5 py-3 text-[15px] text-ink";
const labelClass = "caps mb-2 block text-[14px] text-ink";

/**
 * Two ways in on one card: a password, or a one-time link by email. The password is the first
 * offer; the link stays for anyone who never set one. The handle field takes the email address on
 * the account or the username where one was claimed, so nobody has to remember which kind of
 * account they opened, and the page does not explain that beyond the label. An account made
 * through the link gets the same capabilities as any other.
 *
 * The page checks for an empty box and nothing else: whether a handle is an address or a username
 * is the server's business, and guessing at it here would refuse something an account actually
 * uses. What the server refuses comes back as one sentence for a missing account and a wrong
 * password alike, so this form cannot be used to find out who has an account.
 */
export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, linkInitial);
  const [signInState, signInAction, signInPending] = useActionState(signIn, passwordInitial);

  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [linkEmail, setLinkEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ handle?: string; password?: string; email?: string }>({});

  const handleRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const linkEmailRef = useRef<HTMLInputElement>(null);

  /** Moving between the two ways in clears what the other one was complaining about. */
  const switchTo = (to: "password" | "link") => {
    setErrors({});
    setMode(to);
  };

  if (linkState.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">LINK<br />SENT</Stamp>
        <h2 className="heading text-[clamp(24px,3.2vw,30px)] leading-[1.1]">Check your inbox</h2>
        <p className="mx-auto mt-3 max-w-none">We sent a sign-in link to {linkState.email}.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[14.5px] leading-[1.6] text-muted">
          It works once and expires in an hour. Check your spam folder if it does not arrive.
        </p>
      </div>
    );
  }

  if (mode === "link") {
    return (
      <form
        action={linkAction}
        noValidate
        onSubmit={(e) => {
          if (isBlank(linkEmail)) {
            e.preventDefault();
            setErrors({ email: LOGIN_MESSAGES.email_missing });
            linkEmailRef.current?.focus();
            return;
          }
          setErrors({});
        }}
      >
        <input type="hidden" name="next" value={next} />
        <div className="mb-[22px]">
          <label htmlFor="login-link-email" className={labelClass}>Email</label>
          <input
            ref={linkEmailRef}
            id="login-link-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={linkEmail}
            onChange={(e) => {
              setLinkEmail(e.target.value);
              if (errors.email && !isBlank(e.target.value)) setErrors({});
            }}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "login-link-email-error" : undefined}
            className={fieldClass}
          />
          {errors.email && <FieldError id="login-link-email-error">{errors.email}</FieldError>}
        </div>

        <Button type="submit" disabled={linkPending} className="w-full">
          {linkPending ? "Sending link…" : "Email me a sign-in link"}
        </Button>

        {(linkState.error || linkError) && (
          <p role="alert" className="mt-3 flex items-start gap-2 text-[14.5px] leading-[1.5] text-ink">
            <Bang />
            <span>{linkState.error ?? LOGIN_MESSAGES.link_expired}</span>
          </p>
        )}

        <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
          <button type="button" onClick={() => switchTo("password")} className="cursor-pointer text-accent-ink underline underline-offset-4">
            Use a password instead
          </button>
        </p>
      </form>
    );
  }

  return (
    <form
      action={signInAction}
      noValidate
      onSubmit={(e) => {
        // Nothing is sent while the page can already see what is missing, and the cursor goes to
        // the first box that is empty rather than to the top of the form.
        const found: { handle?: string; password?: string } = {};
        if (isBlank(handle)) found.handle = LOGIN_MESSAGES.handle_missing;
        if (isBlank(password)) found.password = LOGIN_MESSAGES.password_missing;
        if (found.handle || found.password) {
          e.preventDefault();
          setErrors(found);
          (found.handle ? handleRef : passwordRef).current?.focus();
          return;
        }
        setErrors({});
      }}
    >
      <input type="hidden" name="next" value={next} />

      <div className="mb-[18px]">
        <label htmlFor="login-handle" className={labelClass}>Email or username</label>
        <input
          ref={handleRef}
          id="login-handle"
          name="handle"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={handle}
          onChange={(e) => {
            setHandle(e.target.value);
            if (errors.handle && !isBlank(e.target.value)) setErrors((p) => ({ ...p, handle: undefined }));
          }}
          aria-invalid={errors.handle ? true : undefined}
          aria-describedby={errors.handle ? "login-handle-error" : undefined}
          className={fieldClass}
        />
        {errors.handle && <FieldError id="login-handle-error">{errors.handle}</FieldError>}
      </div>

      <div className="mb-[22px]">
        <label htmlFor="login-password" className={labelClass}>Password</label>
        <div className="relative">
          <input
            ref={passwordRef}
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password && !isBlank(e.target.value)) setErrors((p) => ({ ...p, password: undefined }));
            }}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? "login-password-error" : undefined}
            className={`${fieldClass} pr-[86px]`}
          />
          {/*
            The same control as sign-up, and the same rule: the button's name is the whole state,
            and nothing but the input's type changes, so a password manager still sees the same
            field with the same name and autocomplete.
          */}
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-controls="login-password"
            className="caps absolute right-0 top-0 h-full cursor-pointer px-3.5 text-[14px] text-accent-ink underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/70"
          >
            {showPassword ? "Hide" : "Show"}
            <span className="sr-only"> password</span>
          </button>
        </div>
        {errors.password && <FieldError id="login-password-error">{errors.password}</FieldError>}
      </div>

      <Button type="submit" disabled={signInPending} className="w-full">
        {signInPending ? "Signing in…" : "Sign in"}
      </Button>

      {(signInState.error || linkError) && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[14.5px] leading-[1.5] text-ink">
          <Bang />
          <span>{signInState.error ?? LOGIN_MESSAGES.link_expired}</span>
        </p>
      )}

      <div className="mt-6 grid gap-2 border-t border-line pt-5 text-[14.5px] text-muted">
        <p>
          <Link href="/forgot" className="text-accent-ink underline underline-offset-4">Forgot your password?</Link>
        </p>
        <p>
          <button type="button" onClick={() => switchTo("link")} className="cursor-pointer text-accent-ink underline underline-offset-4">
            Email me a sign-in link
          </button>
        </p>
        <p>
          New here? <Link href="/signup" className="text-accent-ink underline underline-offset-4">Create an account</Link>.
        </p>
      </div>
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
