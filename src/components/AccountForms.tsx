"use client";
import { useActionState, useId } from "react";
import {
  removeAccountPhoto,
  saveAccountName,
  saveAccountPhoto,
  type AccountNameState,
  type AccountPhotoState,
} from "@/app/actions/account";
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
