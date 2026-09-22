"use client";
import Link from "next/link";
import { useActionState } from "react";
import { updatePassword, type ResetState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";

const initial: ResetState = { ok: false };

const fieldClass = "field mb-[18px] w-full bg-ground px-3.5 py-3 text-[15px] text-ink";
const labelClass = "caps mb-2 block text-[14px] text-ink";

/*
  Asking for the reset link is /forgot's own form, in src/app/forgot/ForgotPasswordForm.tsx. There
  used to be a second copy of it here, which nothing rendered; it is gone rather than left to drift
  away from the one people actually see.
*/

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
      <label htmlFor="new-password-confirm" className={labelClass}>Confirm password</label>
      <input id="new-password-confirm" name="confirm" type="password" autoComplete="new-password" required minLength={10} className={fieldClass} />
      <p className="mb-[22px] text-[14px] leading-[1.5] text-muted">Use at least 10 characters.</p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving password…" : "Save password"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[14.5px] leading-[1.5] text-ink">
          <span
            aria-hidden="true"
            className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center border border-accent-ink text-[12px] font-bold leading-none text-accent-ink"
          >
            !
          </span>
          <span>{state.error}</span>
        </p>
      )}
    </form>
  );
}
