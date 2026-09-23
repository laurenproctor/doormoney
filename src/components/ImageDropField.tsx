"use client";
import { useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";

/*
  One image, chosen by dropping it or by picking it.

  The drop zone is a label around a real file input, so everything a mouse can do here a keyboard
  can do too: Tab reaches the input, Enter or Space opens the file picker, and the zone shows the
  focus ring. Dragging is an extra way in, never the only one. Every state is said in words in a
  live region: what was chosen, how big it is, and why a file was refused.

  The file rides in the form it sits in, under `name`, like any other input. Nothing is uploaded
  here: the server action checks the type and the size again, because this check is a courtesy.
*/

/** A size a person reads: "84KB", "2.3MB". A small file never reads as 0.00MB. */
const megabytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / (1024 * 1024)).toFixed(1)}MB`);

export function ImageDropField({
  id,
  name,
  accept,
  acceptWords,
  maxBytes,
  current,
  currentAlt,
  shape,
  describedBy,
  invalid,
  reset,
}: {
  id: string;
  name: string;
  /** MIME types, as the input's accept attribute and as the check on a dropped file. */
  accept: readonly string[];
  /** The same list for a person: "JPG, PNG, WebP or GIF". */
  acceptWords: string;
  maxBytes: number;
  /** The image on the profile now, already signed. */
  current: string | null;
  currentAlt: string;
  /** A round avatar, or a wide header. */
  shape: "circle" | "wide";
  describedBy?: string;
  invalid?: true;
  /**
   * A count of saves that have landed. When it moves, the chosen file is let go and the input is
   * emptied: the form autosaves, and a file left sitting in the input would be uploaded again on
   * every later save. `current` has by then become the image that was actually stored.
   */
  reset?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [chosen, setChosen] = useState<{ name: string; size: number; url: string } | null>(null);
  const [refused, setRefused] = useState<string | null>(null);

  // A preview is a blob address, and the browser keeps the blob until it is let go.
  useEffect(() => () => { if (chosen) URL.revokeObjectURL(chosen.url); }, [chosen]);

  // The file is on the server now, so the input lets go of it. Skips the first render, where
  // nothing has been saved and there is nothing to clear.
  const lastReset = useRef(reset);
  useEffect(() => {
    if (reset === lastReset.current) return;
    lastReset.current = reset;
    if (input.current) input.current.value = "";
    setChosen(null);
    setRefused(null);
  }, [reset]);

  function take(file: File | undefined) {
    if (!file) return;
    if (!accept.includes(file.type)) return refuse(`That file is not a ${acceptWords}.`);
    if (file.size > maxBytes) return refuse(`That file is ${megabytes(file.size)}. Keep it under ${megabytes(maxBytes)}.`);
    setRefused(null);
    setChosen({ name: file.name, size: file.size, url: URL.createObjectURL(file) });
  }

  function refuse(why: string) {
    if (input.current) input.current.value = "";
    setChosen(null);
    setRefused(why);
  }

  function drop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (!file || !input.current) return;
    // The form submits what the input holds, so a dropped file has to be put into it.
    const carrier = new DataTransfer();
    carrier.items.add(file);
    input.current.files = carrier.files;
    take(file);
  }

  function clear() {
    if (input.current) input.current.value = "";
    setChosen(null);
    setRefused(null);
    input.current?.focus();
  }

  const shown = chosen?.url ?? current;
  const frame = shape === "circle" ? "h-[96px] w-[96px] rounded-full" : "aspect-[4/1] w-full";

  return (
    <div>
      <label
        htmlFor={id}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex cursor-pointer items-center gap-5 border border-dashed p-5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-ink ${
          shape === "wide" ? "flex-col items-stretch" : ""
        } ${over ? "border-accent-line bg-accent/10" : "border-field-line bg-panel hover:border-ink/50"}`}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={chosen ? "The image chosen, not saved yet" : currentAlt} className={`edge ${frame} flex-none object-cover`} />
        ) : (
          <span aria-hidden="true" className={`edge ${frame} flex flex-none items-center justify-center text-[14px] text-muted`}>
            {shape === "circle" ? "None" : "No header yet"}
          </span>
        )}
        <span className="min-w-0">
          <span className="block text-[15px] text-ink">{over ? "Drop the image here" : "Drag an image here, or choose a file"}</span>
          <span className="caps edge mt-3 inline-block bg-transparent px-4 py-2.5 text-[14px] text-ink">Choose a file</span>
        </span>
        <input
          ref={input}
          id={id}
          name={name}
          type="file"
          accept={accept.join(",")}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          onChange={(e) => take(e.target.files?.[0])}
          className="sr-only"
        />
      </label>

      <p role="status" aria-live="polite" className={`mt-2 max-w-none text-[14px] ${refused ? "text-[14.5px] text-accent-ink" : "text-muted"}`}>
        {refused ?? (chosen ? `Chosen: ${chosen.name}, ${megabytes(chosen.size)}. It uploads with the next save.` : "")}
      </p>
      {chosen && (
        <button type="button" onClick={clear} className="caps mt-1 cursor-pointer bg-transparent text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
          Remove this choice
        </button>
      )}
    </div>
  );
}
