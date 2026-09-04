"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { signUp, type SignUpState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { slugWhileTyping, slugify } from "@/lib/slug";

const initial: SignUpState = { ok: false };

const fieldClass = "edge w-full bg-ground px-3.5 py-3 text-[15px]";
const labelClass = "caps mb-2 block text-[14px] text-muted";

/**
 * Opens an account. The username is the board address too, so it is shaped like one
 * while it is typed and the address it will become sits under the field.
 */
export function SignUpForm({ next, siteUrl }: { next: string; siteUrl: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  const [username, setUsername] = useState("");
  const errors = state.errors ?? {};

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

      <label htmlFor="signup-username" className={labelClass}>Username</label>
      <input
        id="signup-username"
        name="username"
        type="text"
        value={username}
        onChange={(e) => setUsername(slugWhileTyping(e.target.value))}
        onBlur={() => setUsername((u) => slugify(u))}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        aria-describedby="signup-username-hint"
        className={fieldClass}
      />
      <p id="signup-username-hint" className="mb-[18px] mt-2 text-[14px] text-muted">
        The board lives here: {siteUrl}/board/{username || "the-act"}
      </p>
      {errors.username && <p className="mb-[18px] -mt-3 text-[14.5px] text-accent-ink">{errors.username}</p>}

      <label htmlFor="signup-email" className={labelClass}>Email</label>
      <input id="signup-email" name="email" type="email" autoComplete="email" required className={fieldClass} />
      {errors.email ? (
        <p className="mb-[18px] mt-2 text-[14.5px] text-accent-ink">{errors.email}</p>
      ) : (
        <p className="mb-[18px] mt-2 text-[14px] text-muted">Where the money notices and the reset link go.</p>
      )}

      <label htmlFor="signup-password" className={labelClass}>Password</label>
      <input id="signup-password" name="password" type="password" autoComplete="new-password" required minLength={10} className={fieldClass} />
      {errors.password ? (
        <p className="mb-[18px] mt-2 text-[14.5px] text-accent-ink">{errors.password}</p>
      ) : (
        <p className="mb-[18px] mt-2 text-[14px] text-muted">At least 10 characters.</p>
      )}

      <Button type="submit" disabled={pending}>{pending ? "One second" : "Open the account"}</Button>
      {errors.form && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{errors.form}</p>}

      <p className="mt-6 border-t border-line pt-5 text-[14.5px] text-muted">
        Already listed? <Link href="/login" className="text-accent-ink underline underline-offset-4">Sign in</Link>.
      </p>
    </form>
  );
}
