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
          <label key={r} className="poster hard-border cursor-pointer bg-white px-4 py-2 text-[14px] has-[:checked]:bg-tape">
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
      {state.errors?.form && <p className="typewriter text-[13px] text-red">{state.errors.form}</p>}
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
        className="hard-border w-full bg-white px-3.5 py-3 text-[15px] focus:shadow-[4px_4px_0_var(--black)] focus:outline-none"
      />
      {error && <p className="typewriter mt-1 text-[13px] text-red">{error}</p>}
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
        <p className="typewriter max-w-none">On the list. An email goes out when listings open.</p>
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
            className="poster hard-border min-w-[120px] flex-1 cursor-pointer bg-white p-3 text-center text-[16px] has-[:checked]:bg-tape has-[:checked]:shadow-[inset_0_0_0_2px_var(--black)]"
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
      {state.errors?.form && <p className="typewriter mt-1.5 text-[13px] text-red">{state.errors.form}</p>}
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
      <label htmlFor={id} className="poster mb-1.5 block text-[15px] tracking-[0.04em]">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="typewriter hard-border w-full bg-paper px-3.5 py-3 text-[15px]"
      />
      {error && <p className="typewriter mt-1.5 text-[13px] text-red">{error}</p>}
    </div>
  );
}
