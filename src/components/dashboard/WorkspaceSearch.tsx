"use client";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Search } from "@/components/dashboard/icons";

/**
 * The top bar's search: a filter over what is already on the page, and a way to a fundraiser.
 *
 * It asks the server nothing. Two things happen as somebody types, and neither is a query:
 *
 *   The rows on the page are filtered. Every row that can be searched carries `data-search` with
 *   its own words in it (the Desk `Table` and `TaskRow` write the attribute; a page hands them the
 *   string). A row whose words do not contain what was typed is hidden, and the count under the
 *   box says how many are left. Nothing is fetched and nothing is re-rendered: the rows were drawn
 *   by the server and this only decides which of them are shown.
 *
 *   The fundraisers this account owns are matched by title. That list is handed down by the page
 *   from rows it had already read, so this costs no read either, and a match is a link. It is how
 *   somebody gets from the Money page to a fundraiser without going through Today first.
 *
 * Cmd+K (Ctrl+K off a Mac) puts the cursor in the box from anywhere in the workspace. Escape
 * empties it, which puts every row back, and hands focus back to the page.
 *
 * The rows are hidden by setting `hidden` on them, which is a DOM attribute React does not write
 * on these elements and therefore does not take back. `globals.css` carries the one rule that
 * makes it stick over a grid row's own display.
 */

/** One place the search can send somebody: a fundraiser, by the title its organizer gave it. */
export type SearchJump = {
  label: string;
  href: string;
  /** The status or period beside it, so two drafts with similar names are told apart. */
  hint?: string;
};

const ROWS = "[data-search]";
/** A card that is its rows: it goes when the last of them is filtered out. */
const GROUPS = "[data-search-group]";
/** As many fundraisers as fit under the box without it becoming a page of its own. */
const SHOWN = 6;

const norm = (value: string) => value.trim().toLowerCase();

export function WorkspaceSearch({ jumps = [] }: { jumps?: readonly SearchJump[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [matched, setMatched] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const term = norm(query);

  /** Show every row again. Called when this leaves the page, so no filter outlives its page. */
  const showEverything = useCallback(() => {
    for (const el of document.querySelectorAll<HTMLElement>(`${ROWS}, ${GROUPS}`)) el.hidden = false;
  }, []);

  /*
    Typing is what filters, so the filtering happens where the typing does rather than in an effect
    watching the state afterwards. The rows are not React's to re-render, and an effect that set
    state from them would be a second render for every keystroke.
  */
  const filter = useCallback((next: string) => {
    setQuery(next);
    const wanted = norm(next);
    const rows = [...document.querySelectorAll<HTMLElement>(ROWS)];
    const groups = [...document.querySelectorAll<HTMLElement>(GROUPS)];
    if (!wanted) {
      for (const el of [...rows, ...groups]) el.hidden = false;
      setMatched(null);
      return;
    }
    let left = 0;
    for (const row of rows) {
      const hit = norm(row.dataset.search ?? "").includes(wanted);
      row.hidden = !hit;
      if (hit) left += 1;
    }
    // A card whose last row has gone goes with it, so no heading stands over an empty frame with a
    // count of what used to be under it. A card holding no searchable row at all is left alone.
    for (const group of groups) {
      const own = [...group.querySelectorAll<HTMLElement>(ROWS)];
      group.hidden = own.length > 0 && own.every((row) => row.hidden);
    }
    setMatched(rows.length === 0 ? null : left);
  }, []);

  useEffect(() => showEverything, [showEverything]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const found = term ? jumps.filter((j) => norm(j.label).includes(term)).slice(0, SHOWN) : [];
  const showList = open && term.length > 0 && found.length > 0;

  return (
    <div className="relative hidden md:block">
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search this page and your fundraisers
      </label>
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        id={`${listId}-input`}
        ref={inputRef}
        type="search"
        value={query}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-describedby={`${listId}-count`}
        autoComplete="off"
        placeholder="Search"
        onChange={(e) => {
          filter(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a result has to land before the list goes, so the close waits a tick.
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            filter("");
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
        className="h-9 w-[190px] rounded-control border border-field-line bg-transparent pl-9 pr-12 text-[14px] text-ink outline-none transition-colors placeholder:text-muted focus-visible:border-accent-line focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-ink lg:w-[240px] [&::-webkit-search-cancel-button]:hidden"
      />
      {/* The shortcut, for somebody who has not met it. It is decoration: the label says what the box does. */}
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded-[4px] border border-line px-1.5 py-0.5 text-[14px] leading-none text-muted lg:block"
      >
        ⌘K
      </kbd>

      {/* What the filter did, for a reader who cannot see rows disappear. */}
      <p id={`${listId}-count`} aria-live="polite" className="sr-only">
        {matched === null
          ? ""
          : matched === 0
            ? `Nothing on this page matches ${query}.`
            : `${matched} ${matched === 1 ? "row on this page matches" : "rows on this page match"} ${query}.`}
      </p>

      {showList && (
        <ul
          id={listId}
          className="absolute right-0 top-[calc(100%+6px)] z-50 m-0 w-[280px] list-none overflow-hidden rounded-card border border-line bg-surface p-1 shadow-1"
        >
          {found.map((jump) => (
            <li key={jump.href}>
              <Link
                href={jump.href}
                onClick={() => {
                  filter("");
                  setOpen(false);
                }}
                className="flex min-h-[40px] flex-col justify-center gap-0.5 rounded-control px-2.5 py-1.5 text-[14px] text-ink no-underline hover:bg-neutral-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-ink"
              >
                <span className="truncate font-medium">{jump.label}</span>
                {jump.hint && <span className="truncate text-muted">{jump.hint}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
