"use client";
import { useActionState, useId, useState } from "react";
import {
  removeAccountPhoto,
  saveAccountName,
  saveAccountPhoto,
  type AccountNameState,
  type AccountPhotoState,
} from "@/app/actions/account";
import {
  subscribeAccountNewsletter,
  unsubscribeAccountNewsletter,
  type CommunicationsState,
} from "@/app/actions/communications";
import { Button } from "@/components/Button";
import { inputClass } from "@/components/DashboardShell";
import { Field } from "@/components/ProfileForms";
import { ACCOUNT_PHOTO_ACCEPT } from "@/lib/accountPhoto";
import { NAME_MAX } from "@/lib/signup";

/*
  The account holder's own details: a name in two parts, and a photo.

  Two forms, apart on purpose, so saving a name never re-sends a 5MB file and a refused photo never
  loses a typed name. Same manners as ProfileForms: real buttons in real forms, every state said in
  words, every message in a live region.
*/

const initialName: AccountNameState = { ok: false };
const initialPhoto: AccountPhotoState = { ok: false };
const initialCommunications: CommunicationsState = { ok: false };

export function AccountNameForm({ firstName, lastName }: { firstName: string | null; lastName: string | null }) {
  const [state, action, pending] = useActionState(saveAccountName, initialName);
  const uid = useId();
  const err = state.errors ?? {};

  return (
    <form action={action} noValidate>
      <div className="grid gap-x-5 md:grid-cols-2">
        <Field id={`${uid}-first`} label="First name" hint={`Up to ${NAME_MAX} characters.`} error={err.first_name}>
          {(props) => <input {...props} name="first_name" type="text" autoComplete="given-name" maxLength={NAME_MAX} defaultValue={firstName ?? ""} required className={inputClass} />}
        </Field>
        <Field id={`${uid}-last`} label="Last name" hint={`Up to ${NAME_MAX} characters.`} error={err.last_name}>
          {(props) => <input {...props} name="last_name" type="text" autoComplete="family-name" maxLength={NAME_MAX} defaultValue={lastName ?? ""} required className={inputClass} />}
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save the name"}</Button>
        <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
          {state.ok ? state.message : ""}
        </span>
      </div>
      {err.form && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{err.form}</p>}
    </form>
  );
}

/**
 * The private account photo.
 *
 * Nothing renders this today. It came off /dashboard/profile when two photo uploaders on one page
 * turned out to be one too many: people set this one and wondered why their public page stayed
 * empty, so the patron profile photo, which is the one that shows, is the only one asked for now.
 * The component, its actions and `profiles.photo_path` are all left intact, because nothing was
 * deleted and somewhere may want an account photo again.
 */
export function AccountPhotoForm({ photo }: { photo: string | null }) {
  const [state, action, pending] = useActionState(saveAccountPhoto, initialPhoto);
  const [removed, removeAction, removing] = useActionState(removeAccountPhoto, initialPhoto);
  const uid = useId();

  return (
    <>
      <form action={action} noValidate encType="multipart/form-data">
        <Field
          id={`${uid}-photo`}
          label="Profile photo"
          hint="JPG, PNG, WebP or GIF, under 5MB. An animated GIF plays. Choosing a new one replaces the old one."
          error={state.error}
        >
          {(props) => (
            <>
              {photo && (
                // A plain img on purpose: next/image would flatten an animated GIF to its first frame.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="The photo on your account now" width={96} height={96} className="edge mb-3 h-[96px] w-[96px] rounded-full object-cover" />
              )}
              <input {...props} name="photo" type="file" accept={ACCOUNT_PHOTO_ACCEPT} className="block text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink" />
            </>
          )}
        </Field>

        <div className="mt-2 flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending || removing}>{pending ? "Saving" : "Save the photo"}</Button>
          <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
            {/* Both results outlive their click, so the photo itself says which one is current. */}
            {photo ? (state.ok ? state.message : "") : removed.ok ? removed.message : ""}
          </span>
        </div>
      </form>

      {photo && (
        <form action={removeAction} className="mt-4">
          <button type="submit" disabled={pending || removing} className="text-[14.5px] text-accent-ink underline underline-offset-4 disabled:opacity-60">
            {removing ? "Removing" : "Remove the photo"}
          </button>
          {removed.error && <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">{removed.error}</p>}
        </form>
      )}
    </>
  );
}

/**
 * The one list Door Money runs, switched from the account that gets it.
 *
 * One button, and the state said in words above it: "Subscribed" or "Not subscribed", so nothing
 * here depends on noticing a color. The address is the one on the account and is never typed
 * again. The result goes into a live region, so the confirmation is announced rather than only
 * seen, and the switch flips at once rather than waiting for a reload.
 *
 * There is one topic today and the control says so. A second one does not belong beside this as a
 * second button with its own action: migration 0052 says where topics go when there are any.
 */
export function NewsletterPreferenceForm({
  subscribed: initialSubscribed,
  email,
  configured,
  ownedByAnother,
}: {
  subscribed: boolean;
  /** Shown, never asked for: the address the email would go to. */
  email: string | null;
  /** False when the list cannot be reached at all, so the card says so instead of guessing. */
  configured: boolean;
  /** The address is on the list under another account, so this one must not move it. */
  ownedByAnother: boolean;
}) {
  const [subState, subscribe, subscribing] = useActionState(subscribeAccountNewsletter, initialCommunications);
  const [unsubState, unsubscribe, unsubscribing] = useActionState(unsubscribeAccountNewsletter, initialCommunications);
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [result, setResult] = useState<CommunicationsState | null>(null);

  /*
    The server has the last word, and its answer arrives as a new state object rather than as a
    prop change. Adopting it while rendering is React's own way of reacting to that: an effect
    would render once with the old switch and then again with the real one. Two actions means two
    of these, and whichever answered last is the one shown.
  */
  const [seenSub, setSeenSub] = useState(subState);
  if (subState !== seenSub) {
    setSeenSub(subState);
    setResult(subState);
    if (subState.ok && subState.subscribed !== undefined) setSubscribed(subState.subscribed);
  }
  const [seenUnsub, setSeenUnsub] = useState(unsubState);
  if (unsubState !== seenUnsub) {
    setSeenUnsub(unsubState);
    setResult(unsubState);
    if (unsubState.ok && unsubState.subscribed !== undefined) setSubscribed(unsubState.subscribed);
  }

  if (!configured) {
    return (
      <p className="text-[14.5px] text-muted">
        The list cannot be reached just now, so this cannot say whether the account is on it. The unsubscribe link
        at the foot of any of these emails still works.
      </p>
    );
  }

  const pending = subscribing || unsubscribing;

  return (
    <div>
      <p className="mb-2 text-[15px] leading-[1.6] text-ink">
        <b className="caps text-[14px] text-accent-ink">{subscribed ? "Subscribed" : "Not subscribed"}</b>
      </p>
      <p className="mb-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
        One short email the week organizers open fundraisers: who they are, what the funding is for, and which
        sponsorship options are open. Never more than once a week.
        {email ? ` It goes to ${email}.` : ""}
      </p>

      {ownedByAnother ? (
        <p className="text-[14.5px] text-muted">
          That address is on the list under another account, so this page will not move it. Tell Door Money and it
          will be sorted out.
        </p>
      ) : (
        <form action={subscribed ? unsubscribe : subscribe}>
          <Button type="submit" variant={subscribed ? "ghost" : "solid"} disabled={pending}>
            {pending ? "Saving" : subscribed ? "Unsubscribe" : "Subscribe"}
          </Button>
        </form>
      )}

      <p role="status" aria-live="polite" className="mt-3 text-[14.5px] text-muted">
        {result?.ok ? result.message : ""}
      </p>
      {result?.error && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {result.error}
        </p>
      )}
    </div>
  );
}
