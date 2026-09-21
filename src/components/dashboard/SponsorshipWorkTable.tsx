"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Launch, Search } from "@/components/dashboard/icons";
import { MarkDecision } from "@/components/MarkDecision";
import { formatMoney } from "@/lib/money";
import { filterWork, materialsLabels, paymentLabel, workAction, workCounts, type WorkFilter, type WorkRow } from "@/lib/dashboardModel";

/**
 * Every sponsorship on the selected fundraiser, and the one thing worth doing to each.
 *
 * A table on a wide screen and a list of cards on a narrow one. The cards repeat the column name
 * beside each value rather than relying on position, so nothing loses its label when the table
 * stops being a table.
 *
 * Search and filtering are here rather than in the query string because they are a way of looking
 * at rows already on the page, and a round trip to re-read the same rows would be slower and would
 * lose the caret.
 */

/** The filters, in the fundraiser's own word for what a sponsor sends: a logo in music, materials elsewhere. */
function filtersFor(categoryKey: string): { key: WorkFilter; label: string }[] {
  return [
    { key: "all", label: "All" },
    { key: "review", label: "Needs review" },
    { key: "waiting", label: materialsLabels(categoryKey).waiting },
    { key: "approved", label: "Approved" },
    { key: "declined", label: "Declined" },
  ];
}

/** A chip carries its state in words. Colour is the second signal, never the only one. */
function LogoChip({ row, categoryKey }: { row: WorkRow; categoryKey: string }) {
  const tone =
    row.logo === "review"
      ? "border-accent-ink text-accent-ink"
      : row.logo === "approved"
        ? "border-line text-ink"
        : row.logo === "declined"
          ? "border-line text-muted line-through"
          : "border-line text-muted";
  return <span className={`caps inline-block border px-2 py-1 text-[14px] ${tone}`}>{materialsLabels(categoryKey)[row.logo]}</span>;
}

function Action({ row, categoryKey }: { row: WorkRow; categoryKey: string }) {
  const action = workAction(row, categoryKey);
  if (action.kind === "review") {
    return (
      <div className="grid gap-2">
        {(row.markText || row.markUrl) && (
          <p className="text-[14px] text-muted">
            {row.markText ? `"${row.markText}"` : categoryKey === "music" ? "A logo file was sent." : "A file was sent."}
            {row.markNote ? ` ${row.markNote}` : ""}
          </p>
        )}
        <MarkDecision purchaseId={row.id} categoryKey={categoryKey} />
      </div>
    );
  }
  return (
    <Link
      href={action.href}
      className="caps inline-flex min-h-[36px] items-center gap-1.5 text-[14px] text-accent-ink underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
    >
      {action.label}
      <Launch size={14} aria-hidden="true" />
    </Link>
  );
}

export function SponsorshipWorkTable({ rows, categoryKey = "music" }: { rows: WorkRow[]; /** The fundraiser's category, for the words. Music when none is passed, which is what this table was built for. */ categoryKey?: string }) {
  const FILTERS = filtersFor(categoryKey);
  const materialsTitle = categoryKey === "music" ? "Logo" : "Materials";
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkFilter>("all");
  const counts = useMemo(() => workCounts(rows), [rows]);
  const shown = useMemo(() => filterWork(rows, query, filter), [rows, query, filter]);

  if (rows.length === 0) {
    return (
      <p className="text-[15px] leading-[1.6] text-muted">
        No sponsorships yet on this fundraiser. They appear here as sponsors take them, with whatever you need to do next.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="work-search" className="sr-only">
            Search sponsors and sponsorship options
          </label>
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            id="work-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sponsors"
            className="field w-full bg-ground py-2.5 pl-10 pr-3.5 text-[14.5px] text-ink"
          />
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Filter by ${categoryKey === "music" ? "logo" : "materials"} state`}>
          {FILTERS.map((f) => {
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`caps min-h-[36px] cursor-pointer border px-3 text-[14px] outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink ${
                  on ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:text-ink"
                }`}
              >
                {f.label} <span className="ml-1 text-[14px]">{counts[f.key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shown.length === 0 ? (
        <p role="status" className="text-[15px] text-muted">
          Nothing matches that. Clear the search or choose another filter.
        </p>
      ) : (
        <>
          {/* Wide: a real table, so the columns are announced with the cells. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Sponsorships on this fundraiser</caption>
              <thead>
                <tr className="border-b border-line">
                  {["Sponsor", "Sponsorship option", "Paid", materialsTitle, "Payment", "Next"].map((h) => (
                    <th key={h} scope="col" className="caps py-2.5 pr-4 text-[14px] font-normal text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => (
                  <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                    <th scope="row" className="py-3.5 pr-4 text-[14.5px] font-medium text-ink">{row.sponsor}</th>
                    <td className="py-3.5 pr-4 text-[14.5px] text-muted">{row.option}</td>
                    <td className="py-3.5 pr-4 text-[14.5px] tabular-nums text-ink">{formatMoney(row.amountCents)}</td>
                    <td className="py-3.5 pr-4"><LogoChip row={row} categoryKey={categoryKey} /></td>
                    <td className="py-3.5 pr-4 text-[14px] text-muted">{paymentLabel(row.paymentStatus)}</td>
                    <td className="py-3.5"><Action row={row} categoryKey={categoryKey} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow: the same rows as cards, each value still named. */}
          <ul className="grid gap-3 md:hidden">
            {shown.map((row) => (
              <li key={row.id} className="edge bg-ground p-4">
                <p className="text-[15px] font-medium text-ink">{row.sponsor}</p>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[14px]">
                  <dt className="caps text-[14px] text-muted">Option</dt>
                  <dd className="text-muted">{row.option}</dd>
                  <dt className="caps text-[14px] text-muted">Paid</dt>
                  <dd className="tabular-nums text-ink">{formatMoney(row.amountCents)}</dd>
                  <dt className="caps text-[14px] text-muted">{materialsTitle}</dt>
                  <dd><LogoChip row={row} categoryKey={categoryKey} /></dd>
                  <dt className="caps text-[14px] text-muted">Payment</dt>
                  <dd className="text-muted">{paymentLabel(row.paymentStatus)}</dd>
                </dl>
                <div className="mt-3"><Action row={row} categoryKey={categoryKey} /></div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
