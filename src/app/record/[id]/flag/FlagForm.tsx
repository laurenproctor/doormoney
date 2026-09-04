"use client";
import { useState } from "react";
import { raisePatronFlag } from "@/app/actions/flags";
import { Button } from "@/components/Button";

/** The patron says the run is not happening. One note, one button, and the money stops. */
export function FlagForm({ id, what }: { id: string; what: string }) {
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [done, setDone] = useState<{ paused: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (done) {
    return (
      <div className="lit bg-panel px-8 py-7 max-md:px-6" role="status">
        <p className="caps mb-3 text-[14.5px] text-accent-ink">On hold</p>
        <p className="max-w-none text-[16px]">
          {done.paused > 0
            ? `Door Money has the note, and every payment still to go out on ${what} is on hold.`
            : `Door Money has the note. Nothing was left to send, so there is nothing to hold.`}
        </p>
        <p className="mt-2 max-w-none text-[15px] text-muted">A confirmation is on its way by email, and someone will be in touch.</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const r = await raisePatronFlag({ id, note, website });
        setPending(false);
        if (!r.ok) setError(r.error);
        else setDone({ paused: r.paused });
      }}
      className="edge bg-panel p-6 max-md:p-4"
    >
      <label className="block">
        <span className="caps mb-2 block text-[14px] text-muted">What happened, if it helps. Optional.</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="The dates came off the venue's calendar."
          className="edge w-full px-3.5 py-3 text-[15px]"
        />
      </label>
      {/* Left empty by people, filled in by robots. */}
      <input value={website} onChange={(e) => setWebsite(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending} arrow>
          {pending ? "One second" : "Hold the money"}
        </Button>
        <span className="text-[14px] text-muted">Nothing is charged or refunded by this.</span>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[14.5px] text-accent-ink">
          {error}
        </p>
      )}
    </form>
  );
}
