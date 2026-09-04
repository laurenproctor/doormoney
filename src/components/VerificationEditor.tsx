"use client";
import { useActionState, useState } from "react";
import { saveVerification, type VerificationState } from "@/app/actions/verification";
import { Button } from "@/components/Button";
import { OTHER_KEY, OTHER_MAX, OTHER_MIN, VERIFICATION_METHODS } from "@/lib/verification";

const initial: VerificationState = { ok: false };

/**
 * What patrons get back from this run, as a list of ticks.
 *
 * The rows are real checkboxes with a drawn mark over them, so a keyboard reaches every row, the
 * label click target is the whole row, and nothing depends on colour alone. The write-in box only
 * appears under its own tick, and its text is cleared on the server the moment that tick comes off.
 */
export function VerificationEditor({
  runId,
  methods,
  other,
  runStatus,
}: {
  runId: string;
  methods: string[];
  other: string | null;
  runStatus: string;
}) {
  const [state, action, pending] = useActionState(saveVerification, initial);
  const [picked, setPicked] = useState<string[]>(() => VERIFICATION_METHODS.filter((m) => methods.includes(m.key)).map((m) => m.key));
  const [answer, setAnswer] = useState(other ?? "");
  const err = state.errors ?? {};
  const otherOn = picked.includes(OTHER_KEY);
  const draft = runStatus === "draft";

  const toggle = (key: string, on: boolean) => setPicked((prev) => (on ? [...prev, key] : prev.filter((k) => k !== key)));
  const trimmed = answer.trim().length;

  return (
    <form action={action} noValidate>
      <input type="hidden" name="run_id" value={runId} />

      <div className="edge bg-panel">
        {VERIFICATION_METHODS.map((m) => {
          const on = picked.includes(m.key);
          return (
            <label
              key={m.key}
              className={`grid cursor-pointer grid-cols-[26px_1fr] items-start gap-4 border-b border-line p-4 last:border-b-0 has-[:focus-visible]:bg-accent/10 ${on ? "" : "opacity-90"}`}
            >
              <input
                type="checkbox"
                name="methods"
                value={m.key}
                checked={on}
                onChange={(e) => toggle(m.key, e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center border text-[16px] leading-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)] ${
                  on ? "border-accent bg-accent text-on-accent" : "border-line bg-ground text-transparent"
                }`}
              >
                &#10003;
              </span>
              <span className="min-w-0">
                <b className="block text-[15px] font-medium">{m.label}</b>
                <span className="block text-[14.5px] leading-[1.5] text-muted">{m.note}</span>
              </span>
            </label>
          );
        })}
      </div>
      {err.methods && <p className="mt-2 text-[14.5px] text-accent-ink">{err.methods}</p>}

      {otherOn && (
        <div className="mt-6 max-w-[62ch]">
          <label className="caps mb-2 block text-[14px] text-muted" htmlFor="verification-other">
            Describe the verification method
          </label>
          <textarea
            id="verification-other"
            name="other"
            rows={3}
            value={answer}
            maxLength={OTHER_MAX}
            onChange={(e) => setAnswer(e.target.value)}
            aria-describedby="verification-other-count"
            aria-invalid={err.other ? true : undefined}
            placeholder="The musician will photograph the marked music stand at selected performances and include the venue and date with each image."
            className="edge w-full bg-transparent px-3.5 py-3 text-[15px] leading-[1.6]"
          />
          <p id="verification-other-count" className="mt-1.5 text-[14px] text-muted">
            {trimmed} of {OTHER_MAX} characters. At least {OTHER_MIN}.
          </p>
          {err.other && <p className="mt-1 text-[14.5px] text-accent-ink">{err.other}</p>}
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>{pending ? "Saving" : "Save the verification"}</Button>
        {state.ok && (
          <span className="text-[14.5px] text-muted">
            Saved. {state.saved} {state.saved === 1 ? "method" : "methods"} on the board.
          </span>
        )}
        {err.form && <span className="text-[14.5px] text-accent-ink">{err.form}</span>}
        {draft && picked.length === 0 && !state.ok && !err.methods && (
          <span className="text-[14.5px] text-muted">A draft can wait. Publishing needs at least one.</span>
        )}
      </div>
    </form>
  );
}
