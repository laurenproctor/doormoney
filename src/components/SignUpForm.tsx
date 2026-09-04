"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp, type SignUpState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { ROLES } from "@/lib/roles";

const initial: SignUpState = { ok: false };

const fieldClass = "edge w-full bg-ground px-3.5 py-3 text-[15px]";
const labelClass = "caps mb-2 block text-[14px] text-muted";

/**
 * Opens an account.
 *
 * Two questions and nothing else: what the person came here to do, and how to reach them. Both
 * answers can be both, and either can change later. No board address is asked for here; a
 * musician picks that when they list the act, which is the moment it means anything.
 */
export function SignUpForm({ next, fixedRoles, submitLabel }: { next: string; fixedRoles?: readonly string[]; submitLabel?: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  const [roles, setRoles] = useState<string[]>([]);
  const errors = state.errors ?? {};
  const toggle = (key: string, on: boolean) => setRoles((prev) => (on ? [...prev, key] : prev.filter((r) => r !== key)));

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

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />

      {/* A patron arriving through their own door has already answered the question, so the page
          does not ask it again. The role rides along as it would have from the checkboxes. */}
      {fixedRoles?.map((r) => <input key={r} type="hidden" name="roles" value={r} />)}

      {!fixedRoles && (
      <fieldset className="mb-[22px]">
        <legend className={labelClass}>What brings you here</legend>
        <div className="grid gap-3">
          {ROLES.map((r) => {
            const on = roles.includes(r.key);
            return (
              <label
                key={r.key}
                className={`grid cursor-pointer grid-cols-[26px_1fr] items-start gap-3.5 border p-3.5 transition-colors ${
                  on ? "border-accent bg-accent/10" : "border-line bg-ground"
                }`}
              >
                <input type="checkbox" name="roles" value={r.key} checked={on} onChange={(e) => toggle(r.key, e.target.checked)} className="peer sr-only" />
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border text-[16px] leading-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] ${
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
        <p className="mt-2.5 text-[14px] text-muted">Both is fine. Plenty of people are both.</p>
        {errors.roles && <p className="mt-1.5 text-[14.5px] text-accent-ink">{errors.roles}</p>}
      </fieldset>
      )}

      <label htmlFor="signup-name" className={labelClass}>Name</label>
      <input id="signup-name" name="display_name" type="text" autoComplete="name" required className={fieldClass} />
      {errors.display_name ? (
        <p className="mb-[18px] mt-2 text-[14.5px] text-accent-ink">{errors.display_name}</p>
      ) : (
        <p className="mb-[18px] mt-2 text-[14px] text-muted">A person or a business. It goes on the thank-you, never on a bill.</p>
      )}

      <label htmlFor="signup-email" className={labelClass}>Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" required className={fieldClass} />
      {errors.email ? (
        <p className="mb-[18px] mt-2 text-[14.5px] text-accent-ink">{errors.email}</p>
      ) : (
        <p className="mb-[18px] mt-2 text-[14px] text-muted">Where the money notices and the records go.</p>
      )}

      <label htmlFor="signup-password" className={labelClass}>Password</label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={10} className={fieldClass} />
      {errors.password ? (
        <p className="mb-[22px] mt-2 text-[14.5px] text-accent-ink">{errors.password}</p>
      ) : (
        <p className="mb-[22px] mt-2 text-[14px] text-muted">At least 10 characters.</p>
      )}

      <Button type="submit" disabled={pending}>{pending ? "One second" : (submitLabel ?? "Sign up")}</Button>
      {errors.form && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{errors.form}</p>}

      <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
        Already have an account? <Link href="/login" className="text-accent-ink underline underline-offset-4">Sign in</Link>.
      </p>
    </form>
  );
}
