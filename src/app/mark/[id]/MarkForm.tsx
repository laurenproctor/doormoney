"use client";
import { materialsWords } from "@/lib/materials-words";
import { useActionState, useState } from "react";
import { submitMark, type MarkState } from "@/app/actions/marks";
import { Button } from "@/components/Button";
import { Stamp } from "@/components/Brand";

const initial: MarkState = { ok: false };

/**
 * The patron sends the logo. A file, a name, or both, and a line to the musician if it needs
 * one. Sending again before the act decides replaces what is there, so a patron who picked the
 * wrong file can just send the right one.
 */
export function MarkForm({
  purchaseId,
  actName,
  surface,
  categoryKey,
  kind,
  resend,
  currentUrl,
  currentText,
  currentNote,
}: {
  purchaseId: string;
  actName: string;
  surface: string;
  /** The fundraiser's category, which decides whether this is "the logo" or "your materials". */
  categoryKey?: string | null;
  kind?: string | null;
  /** True when a logo is already in, so the copy talks about replacing it. */
  resend: boolean;
  currentUrl: string | null;
  currentText: string | null;
  currentNote: string | null;
}) {
  const [state, action, pending] = useActionState(submitMark, initial);
  const [fileName, setFileName] = useState<string | null>(null);
  const w = materialsWords(categoryKey, kind);

  if (state.ok) {
    return (
      <div className="edge grid items-center gap-8 bg-panel p-8 md:grid-cols-[auto_1fr]">
        <Stamp className="max-md:mx-auto">
          {w.music ? "LOGO" : "ALL"}
          <br />
          SENT
        </Stamp>
        <div>
          <p className="max-w-[46ch] text-[17px]">{w.music ? "The logo is" : "Your materials are"} with {actName}.</p>
          <p className="mt-3 max-w-[46ch] text-[15px] text-muted">
            {w.music
              ? `Nothing goes on the ${surface.toLowerCase()} without their yes. Door Money sends an email either way, and the record of the run fills in from the first show.`
              : `Nothing goes up for the ${surface.toLowerCase()} without their yes. Door Money sends an email either way, and holds the money until ${actName} documents what was delivered.`}
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="edge bg-panel p-8 max-md:p-6">
      <input type="hidden" name="purchase_id" value={purchaseId} />

      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <label htmlFor="mark_file" className="caps mb-2 block text-[14px] text-muted">
            {resend ? w.replaceLabel : w.music ? "The logo" : "A file, if it needs one"}
          </label>
          <input
            id="mark_file"
            name="mark_file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-[15px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink file:mr-4 file:cursor-pointer file:border file:border-field-line file:bg-transparent file:px-4 file:py-2.5 file:text-[14px] file:uppercase file:tracking-[0.14em] file:text-ink"
          />
          <p className="mt-2 max-w-none text-[14px] leading-[1.6] text-muted">
            {w.fileHelp}
            {fileName ? ` Picked: ${fileName}.` : ""}
          </p>
          {currentUrl && !fileName && (
            <div className="mt-4 flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentUrl} alt={w.music ? "The logo already sent" : "The file already sent"} className="edge h-[64px] w-[96px] bg-ground object-contain p-1.5" />
              <span className="caps text-[14px] text-muted">Already sent</span>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="mark_text" className="caps mb-2 block text-[14px] text-muted">
            {w.music ? "The name, as it should read" : "The name or wording, exactly as it should appear"}
          </label>
          <input
            id="mark_text"
            name="mark_text"
            type="text"
            maxLength={80}
            defaultValue={currentText ?? ""}
            placeholder="Kettle St. Coffee"
            className="field w-full px-3.5 py-3 text-[15px]"
          />
          <p className="mt-2 max-w-none text-[14px] leading-[1.6] text-muted">
            {w.nameHelp}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <label htmlFor="mark_note" className="caps mb-2 block text-[14px] text-muted">
          Anything {actName} should know
        </label>
        <textarea
          id="mark_note"
          name="mark_note"
          rows={3}
          maxLength={300}
          defaultValue={currentNote ?? ""}
          placeholder={w.notePlaceholder}
          className="field w-full px-3.5 py-3 text-[15px] leading-[1.6]"
        />
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Button type="submit" disabled={pending} arrow>
          {pending ? "Sending" : resend ? w.resendButton : w.sendButton}
        </Button>
        <p className="max-w-[38ch] text-[14px] leading-[1.6] text-muted">
          {actName} {w.music ? "approves" : "accepts"} it before it goes anywhere.
        </p>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {state.error && <p className="mt-4 text-[14.5px] text-accent-ink">{state.error}</p>}
      </div>
    </form>
  );
}
