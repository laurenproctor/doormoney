"use client";
import { useId, useState, type ReactNode } from "react";

/*
  The preview and the editor, one at a time, with the switch between them.

  Both are rendered by the server and handed in: the preview is the same component the public page
  draws, and the editor is the same ProfileDetailsForm that has always written this row. Nothing is
  duplicated here and nothing is saved here. This file decides which of the two a person is looking
  at, and says so.

  Both stay in the document, hidden rather than unmounted, so half-typed words survive a look at the
  preview and come back untouched. `hidden` takes them out of the accessibility tree as well as off
  the screen, so a screen reader is never read a form that is not on show.
*/

export function PatronWorkspace({
  preview,
  editor,
  /** True where there is nothing to preview yet: a new profile opens on the form. */
  startEditing = false,
  /** Said beside the switch, so the state of the page is in words and not only in which panel shows. */
  previewNote,
  /** "Private preview" while nobody can reach the page, plain "Preview" once they can. */
  previewLabel,
}: {
  preview: ReactNode;
  editor: ReactNode;
  startEditing?: boolean;
  previewNote: ReactNode;
  previewLabel: string;
}) {
  const [editing, setEditing] = useState(startEditing);
  const uid = useId();
  const editorId = `${uid}-editor`;
  const previewId = `${uid}-preview`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <span className="caps edge inline-block px-3 py-1.5 text-[14px] text-muted">
            {editing ? "Editing" : previewLabel}
          </span>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            {editing ? "Changes are saved when you save them. Saving never publishes the page." : previewNote}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((on) => !on)}
          aria-expanded={editing}
          aria-controls={editing ? editorId : previewId}
          className="caps edge inline-flex min-h-[44px] cursor-pointer items-center gap-3 bg-transparent px-5 text-[14px] text-ink outline-none transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
        >
          {editing ? "Back to preview" : "Edit profile"}
          <span aria-hidden="true" className="text-[16px] leading-none">
            &rarr;
          </span>
        </button>
      </div>

      <div id={previewId} hidden={editing}>
        {preview}
      </div>
      <div id={editorId} hidden={!editing}>
        {editor}
      </div>
    </div>
  );
}
