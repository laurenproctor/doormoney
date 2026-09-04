"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { sendMagicLink, signIn, type LoginState, type PasswordState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";

const linkInitial: LoginState = { ok: false };
const passwordInitial: PasswordState = {};

const fieldClass = "edge mb-[18px] w-full bg-ground px-3.5 py-3 text-[15px]";
const labelClass = "caps mb-2 block text-[14px] text-muted";

/**
 * Two ways in on one card: a username and password, or a one-time link by email.
 * The password is the first offer; the link stays for anyone who never set one.
 */
export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  const [linkState, linkAction, linkPending] = useActionState(sendMagicLink, linkInitial);
  const [signInState, signInAction, signInPending] = useActionState(signIn, passwordInitial);

  if (linkState.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">LINK<br />SENT</Stamp>
        <p className="mx-auto max-w-none">A sign-in link is on its way to {linkState.email}.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-muted">It works once and expires in an hour. Check the spam folder if it takes more than a minute.</p>
      </div>
    );
  }

  if (mode === "link") {
    return (
      <form action={linkAction} noValidate>
        <input type="hidden" name="next" value={next} />
        <label htmlFor="login-link-email" className={labelClass}>Email</label>
        <input id="login-link-email" name="email" type="email" autoComplete="email" required className={fieldClass} />
        <Button type="submit" disabled={linkPending}>{linkPending ? "One second" : "Send the link"}</Button>
        {(linkState.error || linkError) && (
          <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
            {linkState.error ?? "That link has expired or was already used. Send a fresh one."}
          </p>
        )}
        <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
          <button type="button" onClick={() => setMode("password")} className="cursor-pointer text-accent-ink underline underline-offset-4">
            Use a password instead
          </button>
        </p>
      </form>
    );
  }

  return (
    <form action={signInAction} noValidate>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="login-handle" className={labelClass}>Username or email</label>
      <input id="login-handle" name="handle" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required className={fieldClass} />
      <label htmlFor="login-password" className={labelClass}>Password</label>
      <input id="login-password" name="password" type="password" autoComplete="current-password" required className={fieldClass} />
      <Button type="submit" disabled={signInPending}>{signInPending ? "One second" : "Sign in"}</Button>
      {(signInState.error || linkError) && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {signInState.error ?? "That link has expired or was already used. Use a password, or send a fresh link."}
        </p>
      )}
      <div className="mt-6 grid gap-2 border-t border-line pt-5 text-[14.5px] text-muted">
        <p>
          <Link href="/forgot" className="text-accent-ink underline underline-offset-4">Forgot the password?</Link>
        </p>
        <p>
          <button type="button" onClick={() => setMode("link")} className="cursor-pointer text-accent-ink underline underline-offset-4">
            Send a sign-in link instead
          </button>
        </p>
        <p>
          No account yet? <Link href="/signup" className="text-accent-ink underline underline-offset-4">Open one</Link>.
        </p>
      </div>
    </form>
  );
}
