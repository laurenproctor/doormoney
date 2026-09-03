"use client";
import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "@/app/actions/auth";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";

const initial: LoginState = { ok: false };

export function LoginForm({ next, linkError }: { next: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(sendMagicLink, initial);

  if (state.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">LINK<br />SENT</Stamp>
        <p className="typewriter mx-auto max-w-none">A sign-in link is on its way to {state.email}.</p>
        <p className="mx-auto mt-2 max-w-[40ch] text-[14.5px] text-gray">It works once and expires in an hour. Check the spam folder if it takes more than a minute.</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="login-email" className="poster mb-1.5 block text-[15px] tracking-[0.04em]">
        Email
      </label>
      <input
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        className="typewriter hard-border mb-[18px] w-full bg-paper px-3.5 py-3 text-[15px]"
      />
      <Button type="submit" disabled={pending}>{pending ? "One second" : "Send the link"}</Button>
      {(state.error || linkError) && (
        <p className="typewriter mt-3 text-[13px] text-red">
          {state.error ?? "That link has expired or was already used. Send a fresh one."}
        </p>
      )}
    </form>
  );
}
