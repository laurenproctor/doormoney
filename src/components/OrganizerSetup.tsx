"use client";
import { useActionState, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { startOrganizer, type SetupState } from "@/app/actions/organizer-setup";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { Locked, Organization, UserProfile } from "@/components/dashboard/icons";
import { COUNTRY_OPTIONS, placeLine } from "@/lib/countries";
import { ORGANIZATION_KINDS, initialsFor, suggestSlug } from "@/lib/organizer-setup";
import { entityKindLabel } from "@/lib/participation";
import { slugWhileTyping, slugify } from "@/lib/slug";

/*
  Who is behind this, in one screen.

  Two answers, and each one asks for only what it does not already know. Somebody raising money
  under their own name has already given it, so that side is a preview and a button. An
  organization is a name, and then four optional lines that can all wait.

  The preview on the right is whatever has been typed and nothing else: no example organization, no
  invented city, no photograph of somebody who has not uploaded one. A part nobody has filled in is
  absent rather than filled with a placeholder.

  Nothing on this screen publishes anything, and the line under the form says so in the present
  tense. It does not say "saved" before a save, and there is no autosave behind it.
*/

export type ExistingOrganizer = {
  name: string;
  slug: string;
  kindLabel: string | null;
  place: string | null;
  photoUrl: string | null;
};

export type SelfIdentity = {
  /** The account holder's own name, or null when this account has not given one. */
  name: string | null;
  /** The word this account already signs in with, when it has one. Never changed here. */
  username: string | null;
  /** The address to suggest when there is no username yet. */
  suggestedSlug: string;
};

const initial: SetupState = {};

export function OrganizerSetup({ self, existing, host, template, live }: {
  self: SelfIdentity;
  /** The organizer this account already manages, when there is one. */
  existing: ExistingOrganizer | null;
  /** The site's address, without the scheme, for showing a public link. */
  host: string;
  /** The starter kit this setup came in on, carried through to the next step. */
  template: string | null;
  /** Whether this organizer already has a fundraiser out of draft. */
  live: boolean;
}) {
  const [state, action, pending] = useActionState(startOrganizer, initial);
  const [choice, setChoice] = useState<"self" | "organization">(existing ? "organization" : "self");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [country, setCountry] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugAsked, setSlugAsked] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const errors = state.errors ?? {};

  // The address on offer: the one they typed, or the one the name makes. For Myself it is the word
  // this account already signs in with, which this screen reads and never writes.
  const selfSlug = self.username ?? self.suggestedSlug;
  const shownSlug = slugTouched ? slug : choice === "self" ? selfSlug : suggestSlug(name);

  // A word that is free, offered when the one they asked for is not.
  const suggestion = state.suggestedSlug;
  // The field opens when somebody asks for it, and stays open while the server has something to
  // say about what is in it. Derived rather than remembered, so an error cannot arrive with the
  // field it is about still folded away.
  const editingSlug = slugAsked || Boolean(errors.slug);

  const previewName = choice === "self" ? self.name : name.trim();
  const previewKind = choice === "self" ? null : entityKindLabel(kind);
  const previewPlace = choice === "self" ? null : placeLine({ city, region, countryCode: country });

  return (
    <form action={action} noValidate encType="multipart/form-data" className="min-w-0">
      {template && <input type="hidden" name="template" value={template} />}

      {existing ? (
        <ExistingChoice organizer={existing} host={host} />
      ) : (
        <IdentityChoice choice={choice} onChoose={setChoice} selfName={self.name} error={errors.choice} />
      )}

      <div className="mt-9 grid min-w-0 gap-9 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-0">
        {/* ------------------------------------------------------------ the form */}
        <div className="min-w-0 lg:pr-10">
          {existing ? (
            <p className="max-w-[54ch] text-[15px] leading-[1.6] text-muted">
              Door Money supports one organizer for each account today. Its name, address and details are edited on
              its own page, and a sponsorship is created under it.
            </p>
          ) : choice === "self" ? (
            <SelfFields
              self={self}
              host={host}
              slug={shownSlug}
              editing={editingSlug}
              onEdit={() => {
                setSlugAsked(true);
                setSlugTouched(true);
                setSlug(shownSlug);
              }}
              onSlugChange={(v) => {
                setSlugTouched(true);
                setSlug(slugWhileTyping(v));
              }}
              onSlugBlur={() => setSlug((s) => slugify(s))}
              error={errors.slug}
              suggestion={suggestion}
              onTakeSuggestion={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
            />
          ) : (
            <OrganizationFields
              host={host}
              name={name}
              onName={setName}
              kind={kind}
              onKind={setKind}
              city={city}
              onCity={setCity}
              region={region}
              onRegion={setRegion}
              country={country}
              onCountry={setCountry}
              slug={shownSlug}
              editing={editingSlug}
              onEdit={() => {
                setSlugAsked(true);
                setSlugTouched(true);
                setSlug(shownSlug);
              }}
              onSlugChange={(v) => {
                setSlugTouched(true);
                setSlug(slugWhileTyping(v));
              }}
              onSlugBlur={() => setSlug((s) => slugify(s))}
              onPhoto={setPhotoUrl}
              suggestion={suggestion}
              onTakeSuggestion={(v) => {
                setSlugTouched(true);
                setSlug(v);
              }}
              errors={errors}
            />
          )}
        </div>

        {/* ------------------------------------------------------------ the preview */}
        <Preview
          name={existing ? existing.name : previewName}
          kindLabel={existing ? existing.kindLabel : previewKind}
          place={existing ? existing.place : previewPlace}
          photoUrl={existing ? existing.photoUrl : photoUrl}
          organization={Boolean(existing) || choice === "organization"}
        />
      </div>

      <div className="mt-10 border-t border-line pt-7">
        <p className="mb-6 flex items-center gap-2.5 text-[14.5px] text-muted">
          <Locked size={16} aria-hidden="true" className="flex-none" />
          {live ? "This step publishes nothing." : "Nothing is public yet."}
        </p>

        {errors.form && (
          <p role="alert" className="mb-5 text-[15px] text-accent-ink">
            {errors.form}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <input type="hidden" name="choice" value={existing ? "organization" : choice} />
          <Button type="submit" arrow disabled={pending}>
            {pending ? "Saving…" : "Continue to sponsorship"}
          </Button>
          <Link
            href="/dashboard"
            className="text-[15px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Back
          </Link>
        </div>

        <p className="mt-6 text-[14.5px] text-muted">Next: Describe your project and what sponsors receive.</p>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------
// The two answers
// ---------------------------------------------------------------

function IdentityChoice({ choice, onChoose, selfName, error }: {
  choice: "self" | "organization";
  onChoose: (c: "self" | "organization") => void;
  selfName: string | null;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="sr-only">Who is behind this</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile
          value="self"
          checked={choice === "self"}
          onChoose={onChoose}
          icon={<UserProfile size={24} aria-hidden="true" />}
          title="Myself"
          detail={selfName ? `Use ${selfName}’s profile` : "Use this account’s profile"}
        />
        <Tile
          value="organization"
          checked={choice === "organization"}
          onChoose={onChoose}
          icon={<Organization size={24} aria-hidden="true" />}
          title="An organization"
          detail="A business, team, or group"
        />
      </div>
      {error && (
        <p id={errorId} className="mt-3 text-[14.5px] text-accent-ink">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function Tile({ value, checked, onChoose, icon, title, detail }: {
  value: "self" | "organization";
  checked: boolean;
  onChoose: (c: "self" | "organization") => void;
  icon: React.ReactNode;
  title: string;
  detail: string;
}) {
  return (
    <label
      className={`edge flex min-w-0 cursor-pointer items-center gap-4 p-5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
        checked ? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]" : "hover:border-ink/40"
      }`}
    >
      <input
        type="radio"
        name="identity"
        value={value}
        checked={checked}
        onChange={() => onChoose(value)}
        className="sr-only"
      />
      <span className={`flex-none ${checked ? "text-accent-ink" : "text-muted"}`}>{icon}</span>
      <span className="min-w-0">
        <span className="heading block text-[16px] text-ink">{title}</span>
        <span className="block text-[14.5px] leading-[1.5] text-muted">{detail}</span>
      </span>
      <span
        aria-hidden="true"
        className={`ml-auto flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full border ${
          checked ? "border-accent" : "border-ink/40"
        }`}
      >
        {checked && <span className="h-[8px] w-[8px] rounded-full bg-accent" />}
      </span>
    </label>
  );
}

/** The organizer this account already manages. One, because the database allows one. */
function ExistingChoice({ organizer, host }: { organizer: ExistingOrganizer; host: string }) {
  return (
    <section aria-labelledby="existing-heading">
      <h2 id="existing-heading" className="caps mb-4 text-[14px] text-muted">
        Your organizer
      </h2>
      <div className="edge flex min-w-0 items-center gap-4 border-accent bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] p-5">
        <span className="flex-none text-accent-ink">
          <Organization size={24} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="heading block truncate text-[16px] text-ink">{organizer.name}</span>
          <span className="block truncate text-[14.5px] text-muted">
            {host}/{organizer.slug}
          </span>
        </span>
        <Link
          href="/dashboard/act"
          className="caps ml-auto flex-none text-[14px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          Edit
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Myself: nothing to re-enter
// ---------------------------------------------------------------

function SelfFields({ self, host, slug, editing, onEdit, onSlugChange, onSlugBlur, error, suggestion, onTakeSuggestion }: {
  self: SelfIdentity;
  host: string;
  slug: string;
  editing: boolean;
  onEdit: () => void;
  onSlugChange: (v: string) => void;
  onSlugBlur: () => void;
  error?: string;
  suggestion?: string;
  onTakeSuggestion: (v: string) => void;
}) {
  return (
    <div className="min-w-0">
      {self.name ? (
        <p className="max-w-[54ch] text-[15px] leading-[1.6] text-muted">
          Sponsorships are created under <span className="text-ink">{self.name}</span>, the name on this account.
          Nothing has to be entered again.
        </p>
      ) : (
        <p className="max-w-[54ch] text-[15px] leading-[1.6] text-muted">
          This account has no name on it yet.{" "}
          <Link href="/dashboard/profile" className="text-accent-ink underline decoration-1 underline-offset-4">
            Add one on your profile
          </Link>
          , or set up an organization instead.
        </p>
      )}

      <div className="mt-7">
        <PublicLink
          host={host}
          slug={slug}
          editing={editing}
          onEdit={onEdit}
          onChange={onSlugChange}
          onBlur={onSlugBlur}
          error={error}
          suggestion={suggestion}
          onTakeSuggestion={onTakeSuggestion}
          note={
            self.username
              ? "The word you already sign in with. Changing this link never changes how you sign in."
              : "Changing this link never changes how you sign in."
          }
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// An organization: a name, and four lines that can wait
// ---------------------------------------------------------------

function OrganizationFields({
  host, name, onName, kind, onKind, city, onCity, region, onRegion, country, onCountry,
  slug, editing, onEdit, onSlugChange, onSlugBlur, onPhoto, suggestion, onTakeSuggestion, errors,
}: {
  host: string;
  name: string; onName: (v: string) => void;
  kind: string; onKind: (v: string) => void;
  city: string; onCity: (v: string) => void;
  region: string; onRegion: (v: string) => void;
  country: string; onCountry: (v: string) => void;
  slug: string; editing: boolean; onEdit: () => void;
  onSlugChange: (v: string) => void; onSlugBlur: () => void;
  onPhoto: (url: string | null) => void;
  suggestion?: string;
  onTakeSuggestion: (v: string) => void;
  errors: NonNullable<SetupState["errors"]>;
}) {
  return (
    <div className="min-w-0">
      <Field label="Organization name" error={errors.name}>
        {(id, described) => (
          <input
            id={id}
            name="name"
            value={name}
            onChange={(e) => onName(e.target.value)}
            autoComplete="organization"
            required
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={described}
            className={inputClass}
          />
        )}
      </Field>

      <div className="grid gap-x-5 sm:grid-cols-2">
        <Field label="Organization type" optional error={errors.entity_kind}>
          {(id, described) => (
            <select
              id={id}
              name="entity_kind"
              value={kind}
              onChange={(e) => onKind(e.target.value)}
              aria-describedby={described}
              className={inputClass}
            >
              <option value="">Not stated</option>
              {ORGANIZATION_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="City" optional error={errors.city}>
          {(id, described) => (
            <input
              id={id}
              name="city"
              value={city}
              onChange={(e) => onCity(e.target.value)}
              autoComplete="address-level2"
              aria-invalid={errors.city ? true : undefined}
              aria-describedby={described}
              className={inputClass}
            />
          )}
        </Field>
      </div>

      <Field label="Country" optional error={errors.country_code}>
        {(id, described) => (
          <select
            id={id}
            name="country_code"
            value={country}
            onChange={(e) => onCountry(e.target.value)}
            autoComplete="country"
            aria-describedby={described}
            className={inputClass}
          >
            <option value="">Not stated</option>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="mt-7">
        <PublicLink
          host={host}
          slug={slug}
          editing={editing}
          onEdit={onEdit}
          onChange={onSlugChange}
          onBlur={onSlugBlur}
          error={errors.slug}
          suggestion={suggestion}
          onTakeSuggestion={onTakeSuggestion}
          note="Changing this link never changes how you sign in."
        />
      </div>

      <MoreDetails region={region} onRegion={onRegion} onPhoto={onPhoto} errors={errors} />
    </div>
  );
}

/** Everything optional, out of the way until somebody wants it. */
function MoreDetails({ region, onRegion, onPhoto, errors }: {
  region: string;
  onRegion: (v: string) => void;
  onPhoto: (url: string | null) => void;
  errors: NonNullable<SetupState["errors"]>;
}) {
  const open = Boolean(errors.bio || errors.website || errors.instagram || errors.photo || errors.region);
  const url = useRef<string | null>(null);
  useEffect(() => () => {
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  return (
    <details open={open} className="group mt-8 border-t border-line pt-6 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink">
        <span aria-hidden="true" className="text-[18px] leading-none text-accent-ink">
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">&minus;</span>
        </span>
        <span className="min-w-0">
          <span className="heading block text-[15.5px] text-ink">Add a photo, bio, and links</span>
          <span className="block text-[14px] text-muted">Optional. You can do this later.</span>
        </span>
      </summary>

      <div className="mt-6">
        <Field label="Photo" optional error={errors.photo} hint="JPG, PNG or WebP, under 5MB.">
          {(id, described) => (
            <input
              id={id}
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby={described}
              onChange={(e) => {
                if (url.current) URL.revokeObjectURL(url.current);
                const file = e.target.files?.[0];
                url.current = file ? URL.createObjectURL(file) : null;
                onPhoto(url.current);
              }}
              className="block text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
            />
          )}
        </Field>

        <Field label="Bio" optional error={errors.bio} hint="Two or three sentences introducing the work.">
          {(id, described) => (
            <textarea
              id={id}
              name="bio"
              rows={4}
              aria-invalid={errors.bio ? true : undefined}
              aria-describedby={described}
              className={inputClass}
            />
          )}
        </Field>

        <Field label="Website" optional error={errors.website}>
          {(id, described) => (
            <input
              id={id}
              name="website"
              type="url"
              placeholder="https://"
              aria-invalid={errors.website ? true : undefined}
              aria-describedby={described}
              className={inputClass}
            />
          )}
        </Field>

        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="Instagram" optional error={errors.instagram} hint="Handle only, no @">
            {(id, described) => (
              <input
                id={id}
                name="instagram"
                aria-invalid={errors.instagram ? true : undefined}
                aria-describedby={described}
                className={inputClass}
              />
            )}
          </Field>

          <Field label="State or region" optional error={errors.region}>
            {(id, described) => (
              <input
                id={id}
                name="region"
                value={region}
                onChange={(e) => onRegion(e.target.value)}
                autoComplete="address-level1"
                aria-invalid={errors.region ? true : undefined}
                aria-describedby={described}
                className={inputClass}
              />
            )}
          </Field>
        </div>
      </div>
    </details>
  );
}

// ---------------------------------------------------------------
// The public link, suggested and editable
// ---------------------------------------------------------------

function PublicLink({ host, slug, editing, onEdit, onChange, onBlur, error, suggestion, onTakeSuggestion, note }: {
  host: string;
  slug: string;
  editing: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onBlur: () => void;
  error?: string;
  suggestion?: string;
  onTakeSuggestion: (v: string) => void;
  note: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const errorId = `${id}-error`;
  const described = [error ? errorId : null, noteId].filter(Boolean).join(" ");

  return (
    <div>
      <label htmlFor={editing ? id : undefined} className={labelClass} id={editing ? undefined : `${id}-label`}>
        Public profile link
      </label>
      {editing ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
          <span className="text-[15px] text-muted">{host}/</span>
          <input
            id={id}
            name="slug"
            value={slug}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            spellCheck={false}
            autoCapitalize="none"
            aria-invalid={error ? true : undefined}
            aria-describedby={described}
            className={`${inputClass} w-auto min-w-[200px] flex-1`}
          />
        </div>
      ) : (
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="min-w-0 break-all text-[15px] text-muted">
            {host}/<span className="text-ink">{slug || "…"}</span>
          </span>
          <button
            type="button"
            onClick={onEdit}
            aria-describedby={`${id}-label`}
            className="cursor-pointer border-0 bg-transparent p-0 text-[15px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Edit
          </button>
          <input type="hidden" name="slug" value={slug} />
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[14.5px] text-accent-ink">
          {error}
          {suggestion && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => onTakeSuggestion(suggestion)}
                className="cursor-pointer border-0 bg-transparent p-0 text-[14.5px] text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
              >
                Use {suggestion}
              </button>
            </>
          )}
        </p>
      )}
      <p id={noteId} className="mt-1.5 text-[14px] text-muted">
        {note}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------
// The preview
// ---------------------------------------------------------------

function Preview({ name, kindLabel, place, photoUrl, organization }: {
  name: string | null;
  kindLabel: string | null;
  place: string | null;
  photoUrl: string | null;
  /** Which glyph stands in while there is no name and no photograph yet. */
  organization: boolean;
}) {
  const initials = useMemo(() => initialsFor(name), [name]);
  const line = [kindLabel, place].filter(Boolean).join(" · ");

  return (
    <aside className="min-w-0 border-t border-line pt-8 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
      <h2 className="caps mb-5 text-[14px] text-muted">Profile preview</h2>

      <div className="mb-5 flex h-[112px] w-[112px] items-center justify-center overflow-hidden bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : initials ? (
          <span className="heading text-[34px] leading-none text-accent-ink">{initials}</span>
        ) : organization ? (
          <Organization size={32} aria-hidden="true" className="text-muted" />
        ) : (
          <UserProfile size={32} aria-hidden="true" className="text-muted" />
        )}
      </div>

      {name ? (
        <p className="heading break-words text-[24px] leading-[1.15] text-ink">{name}</p>
      ) : (
        <p className="text-[15px] leading-[1.5] text-muted">The name appears here as it is typed.</p>
      )}

      {line && <p className="mt-2 text-[14.5px] text-muted">{line}</p>}

      <p className="mt-6 border-t border-line pt-5 text-[14.5px] leading-[1.5] text-muted">
        This name appears on your sponsorships.
      </p>
    </aside>
  );
}

// ---------------------------------------------------------------
// One field, one label, one error
// ---------------------------------------------------------------

function Field({ label, optional, hint, error, children }: {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: (id: string, describedBy: string | undefined) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="mb-[18px] min-w-0">
      <label htmlFor={id} className={labelClass}>
        {label}
        {optional && <span className="ml-2 normal-case tracking-normal text-muted">Optional</span>}
      </label>
      {children(id, described)}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[14px] text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[14.5px] text-accent-ink">
          {error}
        </p>
      )}
    </div>
  );
}
