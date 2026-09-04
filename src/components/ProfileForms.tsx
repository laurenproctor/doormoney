"use client";
import { useActionState, useId, useState } from "react";
import type { ReactNode } from "react";
import { changeUsername, saveProfileDetails, setActivityShown, setProfileVisibility, type ProfileState, type UsernameState } from "@/app/actions/profile";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import {
  BIO_MAX,
  INTERESTS_MAX,
  INTEREST_MAX,
  LOCATION_MAX,
  NAME_MAX,
  SUPPORT_LABEL,
  formatMonth,
  interestsText,
} from "@/lib/profile";
import { slugWhileTyping } from "@/lib/slug";
import type { EligibleItem, OwnProfile } from "@/lib/patronprofile";

/*
  The patron's own side of the public profile.

  Four forms, deliberately apart. The details say who the patron is, the publish control decides
  whether anyone can see the page at all, and each placement or backing carries its own control, so
  turning one on never turns another on. The username sits on its own because it moves the address
  of both this page and, for a musician, their board.

  Every control here is a real button in a real form: keyboard first, no drag and drop anywhere,
  every state said in words rather than in colour, and every message in a live region.
*/

const initial: ProfileState = { ok: false };
const initialUsername: UsernameState = { ok: false };

/** A labelled field with its hint and its error tied to the input by id. */
function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; "aria-describedby": string; "aria-invalid": true | undefined }) => ReactNode;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children({ id, "aria-describedby": hintId, "aria-invalid": error ? true : undefined })}
      <p id={hintId} className={`mt-1.5 max-w-none text-[14px] ${error ? "text-[14.5px] text-accent-ink" : "text-muted"}`}>
        {error ?? hint}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// Who the patron is
// ---------------------------------------------------------------

export function ProfileDetailsForm({ profile, photo }: { profile: OwnProfile | null; photo: string | null }) {
  const [state, action, pending] = useActionState(saveProfileDetails, initial);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const uid = useId();
  const err = state.errors ?? {};

  return (
    <form action={action} noValidate encType="multipart/form-data">
      <Field id={`${uid}-name`} label="Display name" hint={`The name on the page. Up to ${NAME_MAX} characters.`} error={err.display_name}>
        {(props) => <input {...props} name="display_name" type="text" autoComplete="name" maxLength={NAME_MAX} defaultValue={profile?.displayName ?? ""} className={inputClass} />}
      </Field>

      <Field
        id={`${uid}-bio`}
        label="Short bio"
        hint={`${bio.length} of ${BIO_MAX} characters.`}
        error={err.bio}
      >
        {(props) => (
          <textarea
            {...props}
            name="bio"
            rows={3}
            maxLength={BIO_MAX}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className={`${inputClass} leading-[1.6]`}
          />
        )}
      </Field>

      <div className="grid gap-x-5 md:grid-cols-2">
        <Field id={`${uid}-location`} label="City or region" hint="Optional. A neighbourhood or a city, never an address." error={err.location}>
          {(props) => <input {...props} name="location" type="text" maxLength={LOCATION_MAX} defaultValue={profile?.location ?? ""} placeholder="Brooklyn, New York" className={inputClass} />}
        </Field>
        <Field id={`${uid}-website`} label="Website or social link" hint="Optional. A full address starting with https://." error={err.website}>
          {(props) => <input {...props} name="website" type="url" maxLength={200} defaultValue={profile?.website ?? ""} placeholder="https://" className={inputClass} />}
        </Field>
      </div>

      <Field
        id={`${uid}-interests`}
        label="Music preferences"
        hint={`Up to ${INTERESTS_MAX}, one per line or separated by commas. Genres, scenes, instruments, traditions. Under ${INTEREST_MAX} characters each.`}
        error={err.interests}
      >
        {(props) => (
          <textarea
            {...props}
            name="interests"
            rows={4}
            defaultValue={interestsText(profile?.interests)}
            placeholder={"Jazz\nChamber music\nNew York indie\nBassoon"}
            className={`${inputClass} leading-[1.6]`}
          />
        )}
      </Field>

      <Field id={`${uid}-photo`} label="Profile photo" hint="JPG, PNG or WebP, under 5MB. Choosing a new one replaces the old one." error={err.photo}>
        {(props) => (
          <>
            {photo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="The photo on the profile now" width={96} height={96} className="edge mb-3 h-[96px] w-[96px] rounded-full object-cover" />
            )}
            <input {...props} name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block text-[15px]" />
          </>
        )}
      </Field>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save the profile"}</Button>
        <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
          {state.ok ? state.message : ""}
        </span>
      </div>
      {err.form && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {err.form}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------
// Public or private
// ---------------------------------------------------------------

export function PublishForm({ published, ready }: { published: boolean; ready: boolean }) {
  const [state, action, pending] = useActionState(setProfileVisibility, initial);
  const err = state.errors ?? {};

  return (
    <form action={action}>
      <input type="hidden" name="publish" value={published ? "no" : "yes"} />
      <Button type="submit" variant={published ? "ghost" : "solid"} disabled={pending || (!published && !ready)}>
        {pending ? "One second" : published ? "Hide the profile" : "Publish the profile"}
      </Button>
      <p role="status" aria-live="polite" className="mt-3 text-[14.5px] text-muted">
        {state.ok ? state.message : ""}
      </p>
      {err.form && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {err.form}
        </p>
      )}
    </form>
  );
}

// ---------------------------------------------------------------
// One placement, one backing, one control
// ---------------------------------------------------------------

export function ActivityList({ items }: { items: EligibleItem[] }) {
  const [state, action, pending] = useActionState(setActivityShown, initial);
  const err = state.errors ?? {};
  const offered = items.filter((i) => !i.anonymous);
  const anonymous = items.filter((i) => i.anonymous);

  if (items.length === 0) {
    return (
      <p className="max-w-[62ch] text-[15px] text-muted">
        Nothing to show here yet. Placements and backings appear on this list once the payment is held, and each
        one stays off the public page until it is put on.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-line border-y border-line">
        {offered.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
            <div className="min-w-0">
              <b className="block text-[15px] font-medium">
                {item.actName}, {item.runTitle}
              </b>
              <span className="block text-[14px] text-muted">
                {SUPPORT_LABEL[item.kind]}. {item.detail}. {formatMonth(item.supportedAt)}.
              </span>
              <span className={`caps mt-1 block text-[14px] ${item.shown ? "text-accent-ink" : "text-muted"}`}>
                {item.shown ? "On the profile" : "Not shown"}
              </span>
            </div>
            <form action={action} className="sm:justify-self-end">
              <input type="hidden" name="kind" value={item.kind} />
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="show" value={item.shown ? "no" : "yes"} />
              <button
                type="submit"
                disabled={pending}
                className="caps edge cursor-pointer bg-transparent px-4 py-2.5 text-[14px] text-ink transition-colors hover:border-ink disabled:cursor-default disabled:opacity-60"
              >
                {item.shown ? "Hide from profile" : "Show on profile"}
                <span className="sr-only">
                  : {item.actName}, {item.runTitle}
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>

      <p role="status" aria-live="polite" className="mt-4 text-[14.5px] text-muted">
        {state.ok ? state.message : ""}
      </p>
      {err.form && (
        <p role="alert" className="mt-2 text-[14.5px] text-accent-ink">
          {err.form}
        </p>
      )}

      {anonymous.length > 0 && (
        <p className="mt-6 max-w-[62ch] border-t border-line pt-5 text-[14.5px] text-muted">
          {anonymous.length === 1 ? "One spot was" : `${anonymous.length} spots were`} won with anonymous bidding, so
          {anonymous.length === 1 ? " it is" : " they are"} not offered here. An anonymous bid stays anonymous.
        </p>
      )}
    </>
  );
}

// ---------------------------------------------------------------
// The word the address is made of
// ---------------------------------------------------------------

export function UsernameForm({
  username,
  nextChange,
  allowed,
  siteUrl,
  hasAct,
}: {
  username: string | null;
  /** The day a change is next allowed, already in words. Null when the word has never been claimed. */
  nextChange: string | null;
  allowed: boolean;
  siteUrl: string;
  hasAct: boolean;
}) {
  const [state, action, pending] = useActionState(changeUsername, initialUsername);
  const [value, setValue] = useState(username ?? "");
  const uid = useId();
  const host = siteUrl.replace(/^https?:\/\//, "");

  return (
    <form action={action} noValidate>
      <Field
        id={`${uid}-username`}
        label={username ? "Username" : "Claim a username"}
        hint={`${host}/patron/${value || "your-name"}`}
        error={state.error}
      >
        {(props) => (
          <input
            {...props}
            name="username"
            type="text"
            maxLength={40}
            value={value}
            onChange={(e) => setValue(slugWhileTyping(e.target.value))}
            disabled={!allowed}
            className={`${inputClass} disabled:opacity-60`}
          />
        )}
      </Field>

      {username && (
        <p className="mb-4 max-w-[62ch] text-[14.5px] text-muted">
          {allowed
            ? "The username can move once every twelve months. Changing it now starts a fresh twelve months."
            : `The username can move once every twelve months. The next change is allowed on ${nextChange}.`}
          {hasAct && " It is the board address too, so the board moves with it. The old addresses redirect to the new ones."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending || !allowed}>
          {pending ? "One second" : username ? "Change the username" : "Claim the username"}
        </Button>
        <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
          {state.ok ? state.message : ""}
        </span>
      </div>
    </form>
  );
}
