"use client";
import { useActionState, useId, useState } from "react";
import {
  confirmTotpEnrollment,
  disableTotp,
  issueRecoveryCodes,
  startTotpEnrollment,
  verifySignInTotp,
  type EnrollState,
  type RecoveryCodesState,
  type TotpState,
} from "@/app/actions/mfa";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { TOTP_CODE_LENGTH } from "@/lib/mfa";

/*
  Two-factor authentication, on the two screens it appears on: the account page, where it is
  switched on and off, and the sign-in check, where the code is asked for.

  Every state is said in words rather than shown in a color, every message sits in a live region,
  and the code field is a real field with a real label. The QR image is decorative: the same secret
  is printed beside it as text, so a reader who cannot scan a picture is not stuck.

  The secret arrives once, in the reply to the enrollment action, and lives in this component's
  state until the panel closes. It is never sent back to the server and Door Money never stores it.
*/

const initialEnroll: EnrollState = { ok: false };
const initialTotp: TotpState = { ok: false };
const initialCodes: RecoveryCodesState = { ok: false };

/** One authenticator app on the account, as the account page knows it. */
export type SetupFactor = { name: string; addedOn: string };

/**
 * The six-digit field, the same on both screens.
 *
 * `focus` only where the field is the reason the screen changed: the sign-in check, and the setup
 * panel somebody just opened. The field that turns two-factor off renders with the account page,
 * and a page that grabs the cursor on arrival is a page nobody asked a question of.
 */
function CodeField({ id, describedBy, invalid, focus = false }: { id: string; describedBy?: string; invalid?: boolean; focus?: boolean }) {
  return (
    <input
      id={id}
      name="code"
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={focus}
      maxLength={TOTP_CODE_LENGTH + 2}
      placeholder="000000"
      aria-describedby={describedBy}
      aria-invalid={invalid ? true : undefined}
      className={`${inputClass} max-w-[220px] tracking-[0.3em]`}
    />
  );
}

/* ------------------------------------------------------------------ the account page */

export function TwoFactorSetup({
  factors: initialFactors,
  canAddBackup,
  recovery,
}: {
  /** The apps set up on this account. Never a secret, only what each one is called. */
  factors: SetupFactor[];
  /** Whether there is room for a second app. */
  canAddBackup: boolean;
  /** What the project can tell us about recovery codes. `known` is false where it cannot. */
  recovery: { known: boolean; total: number; remaining: number };
}) {
  const [enroll, start, starting] = useActionState(startTotpEnrollment, initialEnroll);
  const [confirmed, confirm, confirming] = useActionState(confirmTotpEnrollment, initialTotp);
  const [removed, remove, removing] = useActionState(disableTotp, initialTotp);
  const [codes, issue, issuing] = useActionState(issueRecoveryCodes, initialCodes);
  const [factors, setFactors] = useState(initialFactors);
  const uid = useId();

  /*
    The server has the last word, and its answer arrives as a new state object rather than as a
    prop change. Adopting it while rendering is React's own way of reacting to that: an effect
    would render the old list once and the real one after. The page revalidates behind this, so
    the optimistic list here is only what is shown until it arrives.
  */
  const [seenConfirm, setSeenConfirm] = useState(confirmed);
  if (confirmed !== seenConfirm) {
    setSeenConfirm(confirmed);
    if (confirmed.ok && confirmed.added) {
      const name = confirmed.added;
      setFactors((list) => (list.some((f) => f.name === name) ? list : [...list, { name, addedOn: "just now" }]));
    }
  }
  const [seenRemove, setSeenRemove] = useState(removed);
  if (removed !== seenRemove) {
    setSeenRemove(removed);
    // Only the apps this call actually took off. Removing one of two must not read as "Off".
    if (removed.ok && removed.removed) {
      const gone = removed.removed;
      setFactors((list) => list.filter((f) => !gone.includes(f.name)));
    }
  }

  const enabled = factors.length > 0;

  // Setting one up, first or backup. Shown whenever an enrollment is open, even on an account
  // that already has an app, because that is what adding the backup looks like.
  if (enroll.ok && enroll.secret && !confirmed.ok) {
    return (
      <div>
        <p className="mb-2 text-[15px] leading-[1.6] text-ink">
          <b className="caps text-[14px] text-accent-ink">Setting up {enroll.name?.toLowerCase() ?? "an authenticator app"}</b>
        </p>
        <ol className="mb-6 grid max-w-[46ch] list-decimal gap-2 pl-5 text-[14.5px] leading-[1.6] text-muted">
          <li>Open an authenticator app on your phone.</li>
          <li>Scan the square below, or type the setup key into the app by hand.</li>
          <li>Enter the six-digit code the app shows.</li>
        </ol>

        <div className="mb-6 flex flex-wrap items-start gap-6">
          {/*
            A base64 data URL built on the server, which the image optimizer cannot take and should
            not: sending the setup secret through a remote optimizer is the last thing this wants.
            `ink` behind it because a QR code is black modules on nothing, and a camera needs light
            under them; it is the palette's own near-white rather than a new color.

            No square at all where the Auth server sent something that is not an SVG. The setup key
            beside it is the same secret and is the path that always works.
          */}
          {enroll.qrCode && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={enroll.qrCode}
              alt=""
              width={180}
              height={180}
              className="edge block h-[180px] w-[180px] flex-none bg-ink p-2.5"
            />
          )}
          <div className="min-w-0">
            <p className={labelClass}>Setup key, if the square will not scan</p>
            <p className="edge max-w-[320px] break-all bg-ground px-3.5 py-3 text-[15px] tracking-[0.12em] text-ink">
              {enroll.secret}
            </p>
            <p className="mt-2 max-w-[40ch] text-[14px] leading-[1.5] text-muted">
              Type it into the app as a time-based key. It is shown once and Door Money does not keep a copy.
            </p>
          </div>
        </div>

        <form action={confirm} noValidate className="grid gap-3">
          <label htmlFor={`${uid}-on`} className={labelClass}>
            The six-digit code
          </label>
          <CodeField id={`${uid}-on`} describedBy={`${uid}-on-hint`} invalid={Boolean(confirmed.error)} focus />
          <p id={`${uid}-on-hint`} className="max-w-[46ch] text-[14px] leading-[1.5] text-muted">
            Nothing is switched on until this code matches.
          </p>
          <div>
            <Button type="submit" disabled={confirming}>
              {confirming ? "Checking" : enabled ? "Add this app" : "Turn on two-factor authentication"}
            </Button>
          </div>
        </form>

        {confirmed.error && (
          <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
            {confirmed.error}
          </p>
        )}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div>
        <p className="mb-2 text-[15px] leading-[1.6] text-ink">
          <b className="caps text-[14px] text-muted">Off</b>
        </p>
        <p className="mb-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
          Use an authenticator app to add another layer of protection. Door Money will ask for a six-digit code
          after sign-in, so a password on its own is not enough to get in. You will need an authenticator app on
          your phone or computer; any of the free ones work.
        </p>
        <form action={start}>
          <Button type="submit" disabled={starting}>
            {starting ? "One second" : "Enable two-factor authentication"}
          </Button>
        </form>
        <p role="status" aria-live="polite" className="mt-3 text-[14.5px] text-muted">
          {removed.ok ? removed.message : ""}
        </p>
        {enroll.error && (
          <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
            {enroll.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2 text-[15px] leading-[1.6] text-ink">
        <b className="caps text-[14px] text-accent-ink">On</b>
      </p>
      <p className="mb-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
        Door Money asks for a six-digit code after sign-in. Any app on this list answers it.
      </p>

      <ul className="mb-6 divide-y divide-line border-y border-line">
        {factors.map((factor) => (
          <li key={factor.name} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-[15px]">
            <span className="text-ink">{factor.name}</span>
            <span className="text-[14px] text-muted">added {factor.addedOn}</span>
          </li>
        ))}
      </ul>

      {canAddBackup && (
        <form action={start} className="mb-6">
          <Button type="submit" variant="ghost" disabled={starting}>
            {starting ? "One second" : "Add a backup authenticator"}
          </Button>
          <p className="mt-2 max-w-[46ch] text-[14px] leading-[1.5] text-muted">
            A second app, on another device or in a password manager. It is the difference between losing a phone
            and losing the account.
          </p>
        </form>
      )}

      <RecoveryCodes codes={codes} issue={issue} issuing={issuing} recovery={recovery} />

      {/*
        One code field, and a button for each thing it can do. The clicked button is the only one
        whose name reaches the action, so `only` names a single app and its absence means all of
        them. A code is asked for every time, even part way through a session.
      */}
      <form action={remove} noValidate className="mt-7 grid gap-3 border-t border-line pt-6">
        <label htmlFor={`${uid}-off`} className={labelClass}>
          Enter a current code to change this
        </label>
        <CodeField id={`${uid}-off`} describedBy={`${uid}-off-hint`} invalid={Boolean(removed.error)} />
        <p id={`${uid}-off-hint`} className="max-w-[46ch] text-[14px] leading-[1.5] text-muted">
          A code from either app. Asking every time is what stops somebody who finds this page open from taking
          the protection off.
        </p>
        <div className="flex flex-wrap gap-3">
          {factors.length > 1 &&
            factors.map((factor) => (
              <Button key={factor.name} type="submit" name="only" value={factor.name} variant="ghost" disabled={removing}>
                Remove {factor.name.toLowerCase()}
              </Button>
            ))}
          <Button type="submit" variant="ghost" disabled={removing}>
            {removing ? "Working" : "Turn off two-factor authentication"}
          </Button>
        </div>
      </form>

      <p role="status" aria-live="polite" className="mt-3 text-[14.5px] text-muted">
        {confirmed.ok ? confirmed.message : removed.ok ? removed.message : ""}
      </p>
      {removed.error && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {removed.error}
        </p>
      )}
    </div>
  );
}

/**
 * Recovery codes, where the project has them.
 *
 * Shown once and never again: Door Money cannot read them back, so the only honest thing to say is
 * "save these now". Where the Auth server has no such endpoint, generating says so and the backup
 * authenticator above remains the way back.
 */
function RecoveryCodes({
  codes,
  issue,
  issuing,
  recovery,
}: {
  codes: RecoveryCodesState;
  issue: (formData: FormData) => void;
  issuing: boolean;
  recovery: { known: boolean; total: number; remaining: number };
}) {
  const has = recovery.known && recovery.total > 0;

  return (
    <div className="border-t border-line pt-6">
      <h4 className="caps mb-2 text-[14px] text-ink">Recovery codes</h4>
      <p className="mb-4 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
        {has
          ? `${recovery.remaining} of ${recovery.total} unused. Each one signs you in once, for the day no authenticator app is to hand.`
          : "One-time codes to keep somewhere safe, for the day no authenticator app is to hand. Each one works once."}
      </p>

      {codes.ok && codes.codes && (
        <div className="mb-4">
          <p className="mb-3 max-w-[46ch] text-[14.5px] leading-[1.6] text-ink">{codes.message}</p>
          <ul className="edge grid gap-1 bg-ground px-4 py-3 text-[15px] tracking-[0.1em] text-ink sm:grid-cols-2">
            {codes.codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
          <p className="mt-2 max-w-[46ch] text-[14px] leading-[1.5] text-muted">
            This is the only time they are shown. Door Money keeps no copy and cannot show them again.
          </p>
        </div>
      )}

      <form action={issue}>
        {has && <input type="hidden" name="replace" value="yes" />}
        <Button type="submit" variant="ghost" disabled={issuing}>
          {issuing ? "One second" : has ? "Replace the recovery codes" : "Generate recovery codes"}
        </Button>
        {has && (
          <p className="mt-2 max-w-[46ch] text-[14px] leading-[1.5] text-muted">
            A new set voids the old one, whether or not it was used.
          </p>
        )}
      </form>

      {codes.error && (
        <p role="alert" className="mt-3 max-w-[46ch] text-[14.5px] leading-[1.5] text-accent-ink">
          {codes.error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the sign-in check */

/** The code, between signing in and reaching anything. `next` is where the visitor was heading. */
export function TotpChallengeForm({ next }: { next: string }) {
  const [state, verify, pending] = useActionState(verifySignInTotp, initialTotp);
  const uid = useId();

  return (
    <form action={verify} noValidate>
      <input type="hidden" name="next" value={next} />
      <label htmlFor={`${uid}-code`} className="caps mb-2 block text-[14px] text-muted">
        Six-digit code, or a recovery code
      </label>
      <CodeField id={`${uid}-code`} describedBy={`${uid}-hint`} invalid={Boolean(state.error)} focus />
      <p id={`${uid}-hint`} className="mb-5 mt-2 max-w-[42ch] text-[14px] leading-[1.5] text-muted">
        Open an authenticator app you set up and enter the code it is showing now. Each one lasts about half a
        minute. If you kept recovery codes, an unused one works here too.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Checking" : "Verify"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {state.error}
        </p>
      )}
    </form>
  );
}
