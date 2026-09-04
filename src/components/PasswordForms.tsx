"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type ResetState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";

const initial: ResetState = { ok: false };

const fieldClass = "edge mb-[18px] w-full bg-ground px-3.5 py-3 text-[15px]";
const labelClass = "caps mb-2 block text-[14px] text-muted";

/** Asks for the reset link. Says the same thing either way, so it cannot be used to find accounts. */
export function ForgotForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">LINK<br />SENT</Stamp>
        <p className="mx-auto max-w-none">If that account exists, a reset link is on its way to the email on it.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[15px] text-muted">
          It works once and expires in an hour. Check the spam folder if it takes more than a minute.
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate>
      <label htmlFor="forgot-handle" className={labelClass}>Username or email</label>
      <input id="forgot-handle" name="handle" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} required className={fieldClass} />
      <Button type="submit" disabled={pending}>{pending ? "One second" : "Send the reset link"}</Button>
      {state.error && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{state.error}</p>}
      <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
        Remembered it? <Link href="/login" className="text-accent-ink underline underline-offset-4">Sign in</Link>.
      </p>
    </form>
  );
}

/**
 * Sets a new password. The reset link signs the visitor in on the way here, so this
 * is the same form an account uses to change a password it still knows.
 */
export function NewPasswordForm({ done = "/dashboard", doneLabel = "Go to the dashboard" }: { done?: string; doneLabel?: string }) {
  const [state, action, pending] = useActionState(updatePassword, initial);

  if (state.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">PASSWORD<br />SET</Stamp>
        <p className="mx-auto max-w-none">The new password is saved.</p>
        <p className="mx-auto mt-4 max-w-none">
          <Link href={done} className="text-accent-ink underline underline-offset-4">{doneLabel}</Link>
        </p>
      </div>
    );
  }

  return (
    <form action={action} noValidate>
      <label htmlFor="new-password" className={labelClass}>New password</label>
      <input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={10} className={fieldClass} />
      <label htmlFor="new-password-confirm" className={labelClass}>Again, to be sure</label>
      <input id="new-password-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} className={fieldClass} />
      <Button type="submit" disabled={pending}>{pending ? "One second" : "Save the password"}</Button>
      {state.error && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{state.error}</p>}
    </form>
  );
}
