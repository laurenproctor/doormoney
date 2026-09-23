"use client";
import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { changeUsername, saveProfileDetails, setActivityShown, setProfileVisibility, type ProfileState, type UsernameState } from "@/app/actions/profile";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { ImageDropField } from "@/components/ImageDropField";
import {
  BIO_MAX,
  CUSTOM_TAG_MAX,
  DEFAULT_PROFILE_THEME,
  INTERESTS_MAX,
  INTEREST_MAX,
  LOCATION_MAX,
  NAME_MAX,
  NAME_MIN,
  PROFILE_THEMES,
  SUPPORT_LABEL,
  formatMonth,
  interestsText,
} from "@/lib/profile";
import { LINK_LABEL_MAX, PROFILE_LINKS_MAX } from "@/lib/links";
import { slugWhileTyping } from "@/lib/slug";
import type { EligibleItem, OwnProfile } from "@/lib/patronprofile";

/*
  The patron's own side of the public profile.

  Four forms, deliberately apart. The details say who the patron is, the publish control decides
  whether anyone can see the page at all, and each sponsorship or backing carries its own control, so
  turning one on never turns another on. The username sits on its own because it moves the address
  of both this page and, for an organizer, their own page.

  Every control here is a real control in a real form: keyboard first, every state said in words
  rather than in color, and every message in a live region. The two images can be dropped onto
  their fields, and that is only ever a second way in: each is a real file input underneath
  (src/components/ImageDropField.tsx). The page color is a choice among the site's own lights,
  named in words beside each swatch.
*/

const PHOTO_ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const HEADER_ACCEPT = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_MAX = 5 * 1024 * 1024;
const chipClass =
  "caps edge cursor-pointer bg-panel px-4 py-2.5 text-[14px] has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink";

/** How long the form waits after the last change before saving itself. */
const AUTOSAVE_MS = 1000;

const initial: ProfileState = { ok: false };
const initialUsername: UsernameState = { ok: false };

/**
 * The location field, with suggestions from a geocoder.
 *
 * A plain text input with a native `datalist` behind it, so the keyboard, the screen reader and
 * the browser's own autofill all behave as they already did, and a place the geocoder has never
 * heard of is still a perfectly good answer. Nothing is required and nothing is validated against
 * the list.
 *
 * The lookup is debounced and goes to our own /api/places, which asks Nominatim on the server:
 * a half-typed location never leaves this site from the browser. A slow or failed lookup shows no
 * suggestions and says nothing, because the field works without them.
 */
function LocationField({ id, defaultValue, ...props }: { id: string; defaultValue: string } & Record<string, unknown>) {
  const [value, setValue] = useState(defaultValue);
  const [places, setPlaces] = useState<string[]>([]);
  const listId = `${id}-places`;
  // The query the suggestions belong to, so a slow answer cannot overwrite a newer one.
  const latest = useRef("");

  useEffect(() => {
    const query = value.trim();
    latest.current = query;
    // Everything, including clearing the list, waits for the debounce: a setState in the body of
    // an effect renders twice for one keystroke, and react-hooks/set-state-in-effect says so.
    const timer = setTimeout(async () => {
      if (query.length < 3) {
        setPlaces([]);
        return;
      }
      try {
        const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { places?: string[] };
        if (latest.current === query) setPlaces(data.places ?? []);
      } catch {
        // No suggestions is a fine outcome. The field is free text.
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [value]);

  return (
    <>
      <input
        {...props}
        id={id}
        name="location"
        type="text"
        list={listId}
        autoComplete="off"
        maxLength={LOCATION_MAX}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={inputClass}
      />
      <datalist id={listId}>
        {places.map((place) => (
          <option key={place} value={place} />
        ))}
      </datalist>
    </>
  );
}

/** A labelled field with its hint and its error tied to the input by id. Shared with AccountForms. */
export function Field({
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

export function ProfileDetailsForm({
  profile,
  photo,
  header,
  categories,
  publicPath,
  published,
  heading,
  intro,
}: {
  profile: OwnProfile | null;
  photo: string | null;
  /** The header image on the profile now, already signed. */
  header: string | null;
  /** The categories the registry offers, already named. Not hardcoded here, so a fifth needs no change. */
  categories: { key: string; label: string }[];
  /** Where the public page lives, once there is a username. Null before one is claimed. */
  publicPath: string | null;
  /** Whether that page answers to anybody yet. */
  published: boolean;
  /** The section's own heading, which shares the sticky bar with the save control. */
  heading?: ReactNode;
  /** One line under the bar saying what this form is for. */
  intro?: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveProfileDetails, initial);
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [other, setOther] = useState(Boolean(profile?.customTag));
  const uid = useId();
  const err = state.errors ?? {};

  /*
    The form saves itself a second after the last change.

    A profile is a page somebody edits in passing: a line of the bio, one more category, a
    different color. Asking them to find a button for each of those is how half of it ends up
    unsaved. So a change arms a timer, another change restarts it, and when they stop the form
    submits itself through the same action the button uses. Nothing else changes: the same
    validation, the same errors in the same places, and saving still publishes nothing.

    Two guards. Nothing is sent while a save is in flight, because the second request would race
    the first over the same row and the photograph it may be carrying. And nothing is sent before
    there is a name to save under, since the row cannot be written without one: the form would
    only answer "Enter a name" at somebody who has not reached that field yet. The button is
    always there for both cases, and it is what works with no JavaScript at all.
  */
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [named, setNamed] = useState((profile?.displayName ?? "").trim().length >= NAME_MIN);
  // A save that has landed clears the two images, so the next autosave does not upload them again.
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    busy.current = pending;
  }, [pending]);

  /*
    Reacting to a save that has landed, without an effect.

    `useActionState` hands back a fresh object for every result, so comparing it with the last one
    seen is how this component knows a save just finished. React supports adjusting state during
    render like this and re-renders before committing; doing the same work in an effect would paint
    the stale line first and the lint rule says so. The server action stays the form's own action,
    untouched, so the button still submits with no JavaScript running.
  */
  const [answered, setAnswered] = useState(state);
  if (answered !== state) {
    setAnswered(state);
    if (state.ok) {
      setDirty(false);
      setSaved((n) => n + 1);
    }
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function changed() {
    const name = formRef.current?.elements.namedItem("display_name");
    const ready = name instanceof HTMLInputElement && name.value.trim().length >= NAME_MIN;
    setNamed(ready);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    if (!ready) return;
    const fire = () => {
      // A save is running: wait for it rather than queue a second one behind it.
      if (busy.current) {
        timer.current = setTimeout(fire, 300);
        return;
      }
      timer.current = null;
      formRef.current?.requestSubmit();
    };
    timer.current = setTimeout(fire, AUTOSAVE_MS);
  }

  return (
    <form ref={formRef} action={action} onChange={changed} noValidate encType="multipart/form-data">
      {/*
        The save control sits at the top right and follows the reader down the form.

        This form is the longest thing on the page, so a button at the foot of it meant scrolling
        past every optional field to save one edit near the top, and no way to tell from up there
        whether the last save worked. It sticks under the workspace header instead: the state of
        the form and the way to force a save are wherever the reader is.
      */}
      <div className="sticky top-[57px] z-20 -mx-6 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] px-6 py-3.5">
        {heading}
        <span role="status" aria-live="polite" className="ml-auto min-w-0 text-[14.5px] text-muted sm:text-right">
          {pending ? (
            "Saving…"
          ) : dirty && !named ? (
            "Add a display name and this saves on its own."
          ) : dirty ? (
            "Unsaved changes. Saving in a moment."
          ) : state.ok ? (
            <>
              {state.message}{" "}
              {publicPath && published ? (
                <a href={publicPath} target="_blank" rel="noreferrer" className="text-accent-ink underline underline-offset-4">
                  View your profile
                </a>
              ) : publicPath ? (
                "Publishing is above. Saving on its own changes nothing anybody else can read."
              ) : (
                <>
                  <Link href="/dashboard/profile#identity" className="text-accent-ink underline underline-offset-4">
                    Claim a username
                  </Link>{" "}
                  to give the page an address.
                </>
              )}
            </>
          ) : state.errors ? (
            "Not saved. The messages below say why."
          ) : (
            "Changes save on their own, a moment after you stop."
          )}
        </span>
        <Button type="submit" register="desk" variant="solid" disabled={pending}>{pending ? "Saving…" : "Save now"}</Button>
      </div>

      {intro && <p className="mb-6 max-w-[62ch] text-[15px] leading-[1.6] text-muted">{intro}</p>}

      <Field id={`${uid}-name`} label="Display name" hint={`The name on the page. Up to ${NAME_MAX} characters.`} error={err.display_name}>
        {(props) => <input {...props} name="display_name" type="text" autoComplete="name" maxLength={NAME_MAX} defaultValue={profile?.displayName ?? ""} className={inputClass} />}
      </Field>

      {/*
        "This profile is for" (patron_profiles.profile_kind) used to sit here, asking a person
        whether they were a person. It was optional, almost nobody answered it, and an unanswered
        question is one more thing between somebody and a saved profile. The column and whatever is
        already in it are untouched, and the public page still shows a kind that was set before
        this: removing the question is not the same as discarding the answer.
      */}
      <Field
        id={`${uid}-bio`}
        label="Short bio or description"
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
        <Field id={`${uid}-location`} label="Location" hint="Optional. A city, a region, a country, or Online. Never a street address." error={err.location}>
          {(props) => <LocationField {...props} defaultValue={profile?.location ?? ""} />}
        </Field>
        <Field id={`${uid}-website`} label="Website or social link" hint="Optional. A full address starting with https://." error={err.website}>
          {(props) => <input {...props} name="website" type="url" maxLength={200} defaultValue={profile?.website ?? ""} placeholder="https://" className={inputClass} />}
        </Field>
      </div>

      <fieldset className="mb-[18px]">
        <legend className={labelClass}>Other links</legend>
        <div className="grid gap-2.5">
          {Array.from({ length: PROFILE_LINKS_MAX }, (_, i) => (
            <div key={i} className="grid gap-2.5 sm:grid-cols-[1fr_2fr]">
              <input
                name={`link_label_${i}`}
                aria-label={`Link ${i + 1} label`}
                maxLength={LINK_LABEL_MAX}
                defaultValue={profile?.links[i]?.label ?? ""}
                placeholder="Label"
                className={inputClass}
              />
              <input
                name={`link_url_${i}`}
                aria-label={`Link ${i + 1} address`}
                type="url"
                maxLength={200}
                defaultValue={profile?.links[i]?.url ?? ""}
                placeholder="https://"
                className={inputClass}
              />
            </div>
          ))}
        </div>
        <p role={err.links ? "alert" : undefined} className={`mt-1.5 max-w-none text-[14px] ${err.links ? "text-[14.5px] text-accent-ink" : "text-muted"}`}>
          {err.links ?? `Optional. Up to ${PROFILE_LINKS_MAX}, each a full address starting with https://. A row with no address is ignored.`}
        </p>
      </fieldset>

      <fieldset className="mb-[18px]">
        <legend className={labelClass}>Categories you support</legend>
        <div className="flex flex-wrap gap-2.5">
          {categories.map((c) => (
            <label key={c.key} className={chipClass}>
              <input type="checkbox" name="categories" value={c.key} defaultChecked={profile?.categoryKeys.includes(c.key) ?? false} className="sr-only" />
              {c.label}
            </label>
          ))}
          {/* Not a category: a tag in the patron's own words, stored as text (migration 0050). */}
          <label className={chipClass}>
            <input type="checkbox" name="category_other" checked={other} onChange={(e) => setOther(e.target.checked)} aria-controls={`${uid}-custom`} className="sr-only" />
            Other
          </label>
        </div>
        <p role={err.categories ? "alert" : undefined} className={`mt-1.5 max-w-none text-[14px] ${err.categories ? "text-[14.5px] text-accent-ink" : "text-muted"}`}>
          {err.categories ?? "Optional. Shown on your public page. It commits you to nothing and changes nothing you have already paid for."}
        </p>
        <div id={`${uid}-custom`} hidden={!other} className="mt-4">
          <Field
            id={`${uid}-custom-input`}
            label="Your own tag"
            hint={`A few words for what you support that is not on the list. Up to ${CUSTOM_TAG_MAX} characters. It appears beside your categories.`}
            error={err.custom_tag}
          >
            {(props) => (
              <input {...props} name="custom_tag" type="text" maxLength={CUSTOM_TAG_MAX} defaultValue={profile?.customTag ?? ""} disabled={!other} placeholder="Community radio" className={inputClass} />
            )}
          </Field>
        </div>
      </fieldset>

      <Field
        id={`${uid}-interests`}
        label="Interests"
        hint={`Up to ${INTERESTS_MAX}, one per line or separated by commas, in your own words. Under ${INTEREST_MAX} characters each.`}
        error={err.interests}
      >
        {(props) => (
          <textarea
            {...props}
            name="interests"
            rows={4}
            defaultValue={interestsText(profile?.interests)}
            className={`${inputClass} leading-[1.6]`}
          />
        )}
      </Field>

      <Field id={`${uid}-photo`} label="Profile photo" hint="JPG, PNG, WebP or GIF, under 5MB. Choosing a new one replaces the old one." error={err.photo}>
        {(props) => (
          <ImageDropField
            id={props.id}
            describedBy={props["aria-describedby"]}
            invalid={props["aria-invalid"]}
            name="photo"
            reset={saved}
            accept={PHOTO_ACCEPT}
            acceptWords="JPG, PNG, WebP or GIF"
            maxBytes={IMAGE_MAX}
            current={photo}
            currentAlt="The photo on the profile now"
            shape="circle"
          />
        )}
      </Field>

      <Field
        id={`${uid}-header`}
        label="Header image"
        hint="Optional. JPG, PNG or WebP, under 5MB, wider than it is tall. It sits beside your name at the top of the page, under the stage light and tinted in your page color."
        error={err.header}
      >
        {(props) => (
          <>
            <ImageDropField
              id={props.id}
              describedBy={props["aria-describedby"]}
              invalid={props["aria-invalid"]}
              name="header"
              reset={saved}
              accept={HEADER_ACCEPT}
              acceptWords="JPG, PNG or WebP"
              maxBytes={IMAGE_MAX}
              current={header}
              currentAlt="The header image on the profile now"
              shape="wide"
            />
            {header && (
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-[15px]">
                <input type="checkbox" name="remove_header" className="h-4 w-4 accent-[var(--accent)]" />
                Remove the header image
              </label>
            )}
          </>
        )}
      </Field>

      <fieldset className="mb-[18px]">
        <legend className={labelClass}>Page color</legend>
        <div className="flex flex-wrap gap-2.5">
          {PROFILE_THEMES.map((t) => (
            <label key={t.key} className="caps edge flex cursor-pointer items-center gap-2.5 bg-panel px-4 py-2.5 text-[14px] has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-ground has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink">
              <input type="radio" name="theme" value={t.key} defaultChecked={(profile?.theme ?? DEFAULT_PROFILE_THEME) === t.key} className="sr-only" />
              {/* The swatch sits in its own theme, so it shows that light's real accent. The name beside it is what says which. */}
              <span data-theme={t.key} aria-hidden="true" className="inline-block h-4 w-4 flex-none rounded-full bg-accent" />
              {t.label}
            </label>
          ))}
        </div>
        <p role={err.theme ? "alert" : undefined} className={`mt-1.5 max-w-none text-[14px] ${err.theme ? "text-[14.5px] text-accent-ink" : "text-muted"}`}>
          {err.theme ?? "The color of light on your public page. These are Door Money's own colors, each already checked for readable text."}
        </p>
      </fieldset>

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
      <Button type="submit" register="desk" variant={published ? "outline" : "solid"} disabled={pending || (!published && !ready)}>
        {pending ? (published ? "Unpublishing…" : "Publishing…") : published ? "Unpublish profile" : "Publish profile"}
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
// One sponsorship, one backing, one control
// ---------------------------------------------------------------

export function ActivityList({ items }: { items: EligibleItem[] }) {
  const [state, action, pending] = useActionState(setActivityShown, initial);
  const err = state.errors ?? {};
  const offered = items.filter((i) => !i.anonymous);
  const anonymous = items.filter((i) => i.anonymous);

  if (items.length === 0) {
    return (
      <p className="max-w-[62ch] text-[15px] text-muted">
        Nothing to show here yet. Sponsorships and backings appear on this list once the payment is held, and each
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
          {hasAct && " It is your organizer address too, so that page moves with it. The old addresses redirect to the new ones."}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" register="desk" variant="solid" disabled={pending || !allowed}>
          {pending ? "Saving…" : username ? "Change username" : "Claim username"}
        </Button>
        <span role="status" aria-live="polite" className="text-[14.5px] text-muted">
          {state.ok ? state.message : ""}
        </span>
      </div>
    </form>
  );
}
