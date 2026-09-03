"use client";
import { useActionState } from "react";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";
import { joinWaitlist, type WaitlistState } from "@/app/actions/waitlist";

const initial: WaitlistState = { ok: false };

/** The short form on Home: band or patron, three fields. */
export function WaitlistForm({ defaultRole = "band" }: { defaultRole?: "band" | "patron" }) {
  const [state, action, pending] = useActionState(joinWaitlist, initial);

  if (state.ok) {
    return (
      <div className="flex items-center gap-6">
        <Stamp>ON THE<br />LIST</Stamp>
        <p>On the list. An email goes out when Door Money opens.</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <fieldset className="flex gap-2.5">
        <legend className="sr-only">Role</legend>
        {(["band", "patron"] as const).map((r) => (
          <label key={r} className="caps edge cursor-pointer px-4 py-2.5 text-[14px] has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent">
            <input type="radio" name="role" value={r} defaultChecked={r === defaultRole} className="sr-only" />
            {r === "band" ? "A band or act" : "A patron"}
          </label>
        ))}
      </fieldset>
      <Field name="name" placeholder="Name or band name" error={state.errors?.name} />
      <Field name="email" type="email" placeholder="Email" error={state.errors?.email} />
      <Field name="city" placeholder="City (optional)" />
      <div>
        <Button type="submit" disabled={pending}>{pending ? "One second" : "Get on the list"}</Button>
      </div>
      {state.errors?.form && <p className="text-[14.5px] text-accent-ink">{state.errors.form}</p>}
    </form>
  );
}

function Field({ name, type = "text", placeholder, error }: { name: string; type?: string; placeholder: string; error?: string }) {
  return (
    <div>
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        aria-label={placeholder}
        className="edge w-full bg-panel px-3.5 py-3 text-[15px] focus:border-accent focus:outline-none"
      />
      {error && <p className="mt-1 text-[14.5px] text-accent-ink">{error}</p>}
    </div>
  );
}

const ACT_TYPES = [
  ["touring_band", "Band"],
  ["house_act", "House act"],
  ["soloist", "Solo"],
] as const;

/** The act signup on List an act: act type instead of role, labelled fields, paper inputs. */
export function ActWaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlist, initial);

  if (state.ok) {
    return (
      <div className="pb-2.5 pt-[26px] text-center">
        <Stamp size="lg" className="mx-auto mb-[18px]">ON THE<br />LIST</Stamp>
        <p className="max-w-none">On the list. An email goes out when listings open.</p>
      </div>
    );
  }

  return (
    <form action={action} noValidate>
      <input type="hidden" name="role" value="band" />
      <fieldset className="mb-[18px] flex flex-wrap gap-3.5">
        <legend className="sr-only">Act type</legend>
        {ACT_TYPES.map(([value, label], i) => (
          <label
            key={value}
            className="caps edge min-w-[120px] flex-1 cursor-pointer bg-panel p-3 text-center text-[16px] has-[:checked]:bg-accent has-[:checked]:text-on-accent has-[:checked]:border-accent"
          >
            <input type="radio" name="act_type" value={value} defaultChecked={i === 0} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <LabelledField name="name" label="Act name" autoComplete="organization" error={state.errors?.name} />
      <LabelledField name="email" label="Email" type="email" autoComplete="email" error={state.errors?.email} />
      <LabelledField name="city" label="City" placeholder="NYC" />
      <Button type="submit" disabled={pending}>{pending ? "One second" : "Get on the list"}</Button>
      {state.errors?.form && <p className="mt-1.5 text-[14.5px] text-accent-ink">{state.errors.form}</p>}
    </form>
  );
}

function LabelledField({
  name,
  label,
  type = "text",
  placeholder,
  autoComplete,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  error?: string;
}) {
  const id = `act-${name}`;
  return (
    <div className="mb-[18px]">
      <label htmlFor={id} className="caps mb-2 block text-[14px] text-muted">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="edge w-full bg-ground px-3.5 py-3 text-[15px]"
      />
      {error && <p className="mt-1.5 text-[14.5px] text-accent-ink">{error}</p>}
    </div>
  );
}
