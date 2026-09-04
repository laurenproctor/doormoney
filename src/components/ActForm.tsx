"use client";
import { useActionState, useState } from "react";
import { saveAct, type ActState } from "@/app/actions/act";
import { Button } from "@/components/Button";
import { inputClass, labelClass } from "@/components/DashboardShell";
import { slugify, slugWhileTyping } from "@/lib/slug";
import type { OwnedAct } from "@/lib/auth";

const ACT_TYPES = [
  ["touring_band", "Band"],
  ["house_act", "House act"],
  ["soloist", "Solo"],
] as const;

const initial: ActState = { ok: false };

export function ActForm({ act, siteUrl, username }: { act: OwnedAct | null; siteUrl: string; username?: string | null }) {
  const [state, action, pending] = useActionState(saveAct, initial);
  const [name, setName] = useState(act?.name ?? "");
  const [slug, setSlug] = useState(act?.slug ?? username ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(act) || Boolean(username));
  const shownSlug = slugTouched ? slug : slugify(name);
  const err = state.errors ?? {};

  return (
    <form action={action} noValidate encType="multipart/form-data">
      <fieldset className="mb-[18px] flex flex-wrap gap-3.5">
        <legend className={labelClass}>Act type</legend>
        {ACT_TYPES.map(([value, label]) => (
          <label
            key={value}
            className="caps edge min-w-[120px] flex-1 cursor-pointer bg-panel p-3 text-center text-[16px] has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:checked]:border-accent"
          >
            <input type="radio" name="type" value={value} defaultChecked={(act?.type ?? "touring_band") === value} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      {err.type && <p className="-mt-3 mb-3 text-[14.5px] text-accent-ink">{err.type}</p>}

      <Field label="Act name" error={err.name}>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="organization" className={inputClass} />
      </Field>

      <Field label="Board address and username" error={err.slug} hint={`${siteUrl}/board/${shownSlug || "the-act"}. The same word signs the act in.`}>
        <input
          name="slug"
          value={shownSlug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugWhileTyping(e.target.value));
          }}
          onBlur={() => setSlug((s) => slugify(s))}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-x-5 md:grid-cols-2">
        <Field label="City" error={err.city}>
          <input name="city" defaultValue={act?.city ?? "New York"} className={inputClass} />
        </Field>
        <Field label="Instagram" error={err.instagram} hint="Handle only, no @">
          <input name="instagram" defaultValue={act?.instagram ?? ""} className={inputClass} />
        </Field>
      </div>

      <Field label="Website" error={err.website}>
        <input name="website" type="url" defaultValue={act?.website ?? ""} placeholder="https://" className={inputClass} />
      </Field>

      <Field label="Bio" error={err.bio} hint="Two or three sentences. Shows on the board.">
        <textarea name="bio" rows={4} defaultValue={act?.bio ?? ""} className={inputClass} />
      </Field>

      <Field label="Photo" error={err.photo} hint="JPG, PNG or WebP, under 5MB. Shows on the board and the widget.">
        {act?.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={act.photo_url} alt="" className="edge mb-3 h-[120px] w-[120px] object-cover" />
        )}
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block text-[15px]" />
      </Field>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : act ? "Save the act" : "Create the act"}</Button>
        {state.ok && <span className="text-[14.5px] text-muted">Saved.</span>}
        {err.form && <span className="text-[14.5px] text-accent-ink">{err.form}</span>}
      </div>
    </form>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="mb-[18px]">
      <label className="block">
        <span className={labelClass}>{label}</span>
        {children}
      </label>
      {hint && !error && <p className="mt-1.5 max-w-none text-[14px] text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-[14.5px] text-accent-ink">{error}</p>}
    </div>
  );
}
