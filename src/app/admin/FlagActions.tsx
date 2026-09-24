"use client";
import { useActionState, useId, useState, useTransition } from "react";
import { clearPatronFlag } from "@/app/actions/flags";
import { removeAccountTotp, type AdminMfaState } from "@/app/actions/admin-mfa";
import type { FlagSource } from "@/lib/flags";
import { Button } from "@/components/Button";

/** Door Money looked and the run is fine: the hold comes off and the paused slices rejoin the queue. */
export function ClearFlag({ source, id }: { source: FlagSource; id: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<string | null>(null);
  if (state) return <span className="text-[14px] text-muted">{state}</span>;
  return (
    <Button
      type="button"
      register="desk"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await clearPatronFlag(source, id);
          setState(r.ok ? `Released ${r.resumed ?? 0}` : (r.error ?? "Did not save"));
        })
      }
    >
      {pending ? "One second" : "Release the hold"}
    </Button>
  );
}

/**
 * Taking an authenticator app off an account that cannot reach its own.
 *
 * The whole address has to be typed: no list to pick the wrong row from, and the action matches it
 * exactly before it deletes anything. The result stays on screen, because whoever did this needs
 * to be able to say what happened.
 */
export function RemoveAccountTotp() {
  const [state, action, pending] = useActionState(removeAccountTotp, { ok: false } as AdminMfaState);
  const uid = useId();

  return (
    <form action={action} noValidate className="grid max-w-[520px] gap-3">
      <label htmlFor={`${uid}-email`} className="text-[14px] text-muted">
        The whole email address on the account
      </label>
      <input
        id={`${uid}-email`}
        name="email"
        type="email"
        autoComplete="off"
        spellCheck={false}
        aria-describedby={`${uid}-hint`}
        aria-invalid={state.error ? true : undefined}
        className="field w-full bg-transparent px-3.5 py-3 text-[15px]"
      />
      <p id={`${uid}-hint`} className="max-w-[56ch] text-[14px] leading-[1.5] text-muted">
        Removing the app signs that account out everywhere and lets it back in with its password alone. Check who
        is asking before using this.
      </p>
      <div>
        <Button type="submit" register="desk" variant="outline" disabled={pending}>
          {pending ? "Removing" : "Remove two-factor from this account"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="text-[14.5px] text-muted">
        {state.ok ? state.message : ""}
      </p>
      {state.error && (
        <p role="alert" className="text-[14.5px] text-accent-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
