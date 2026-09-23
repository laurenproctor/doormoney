import type { ReactNode } from "react";
import { Button } from "@/components/Button";
import { FilterDisclosures } from "@/components/discovery/FilterDisclosures";
import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { SALE_FILTERS, type DiscoveryQuery } from "@/lib/discovery-filters";
import type { DiscoveryChoice } from "@/lib/discovery";

/**
 * Everything a sponsor can narrow by, as one compact toolbar and one plain GET form.
 *
 * A server component with no state of its own: submitting reloads /fundraisers with the choices in
 * the address, which is what makes a filtered page shareable and what makes the back button work.
 * There is no client-side filtering to fall out of step with the server's answer, and nothing is
 * submitted on a keystroke.
 *
 * The search field is first. Then four disclosures, each a native <details>, so they open and close
 * from the keyboard with no script: Category, Location, Budget and More filters. On a wide screen
 * they are a row of menus; on a phone they stack, and a disclosure keeps whatever was ticked in it
 * when it closes because it is the same markup either way. One form, one set of fields, so nothing
 * is ever submitted twice.
 *
 * The search reads the fundraiser's title and the organizer's name, literally, and nothing else. The
 * other questions read structured fields. There is no free-text search over a fundraiser's
 * description, because matching prose would claim the organizer said something they did not.
 */
export function FilterPanel({
  query,
  categories,
  facets,
  countries,
}: {
  query: DiscoveryQuery;
  /** The category registry: `{ key, label }`, so a new category needs no code here. */
  categories: { key: string; label: string }[];
  /** The discovery facets and their tags, from the registry. */
  facets: DiscoveryChoice[];
  /** The country codes that published fundraisers actually record. Empty hides the question. */
  countries: string[];
}) {
  const purposes = facets.find((f) => f.facet.key === "funding_purpose");
  const audiences = facets.find((f) => f.facet.key === "audience_type");
  const locationCount = query.modes.length + query.countries.length + (query.place ? 1 : 0);
  const budgetCount = (query.minCents !== null ? 1 : 0) + (query.maxCents !== null ? 1 : 0);
  const moreCount = query.purposes.length + query.audiences.length + query.sales.length + (query.closingSoon ? 1 : 0);

  return (
    <form method="get" action="/fundraisers" id="discovery-filters" aria-label="Narrow the list" className="relative z-20">
      <FilterDisclosures scope="discovery-filters" />
      {/* The sort survives a change of filters. Left out at the default so the address stays short. */}
      {query.sort !== "relevant" && <input type="hidden" name="sort" value={query.sort} />}

      <div className="flex flex-wrap items-stretch gap-2.5">
        <label className="field flex min-w-[240px] flex-1 items-center gap-3 bg-panel px-3.5 max-lg:basis-full">
          <span aria-hidden="true" className="text-muted"><SearchIcon /></span>
          <span className="sr-only">Search projects or organizers</span>
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Search projects or organizers"
            maxLength={80}
            autoComplete="off"
            className="w-full bg-transparent py-3 text-[15px] outline-none"
          />
        </label>

        <Disclosure label="Category" count={query.categories.length}>
          <Group legend="Category">
            {categories.map((c) => (
              <Check key={c.key} name="category" value={c.key} label={c.label} checked={query.categories.includes(c.key)} />
            ))}
          </Group>
        </Disclosure>

        <Disclosure label="Location" count={locationCount}>
          <Group legend="Where it happens">
            {(["in_person", "online", "hybrid"] as const).map((m) => (
              <Check key={m} name="mode" value={m} label={ACTIVITY_MODE_LABEL[m]} checked={query.modes.includes(m)} />
            ))}
          </Group>
          <fieldset className="mt-5">
            <legend className="caps mb-3 text-[14px] text-muted">Place</legend>
            <label className="block">
              <span className="sr-only">City or region</span>
              <input
                type="text"
                name="place"
                defaultValue={query.place ?? ""}
                placeholder="City or region"
                className="field w-full bg-ground px-3 py-2 text-[15px]"
              />
            </label>
            <p className="mt-2 text-[14px] leading-[1.6] text-muted">
              Matched against where the activity happens, not where the organizer is based.
            </p>
          </fieldset>
          {countries.length > 0 && (
            <Group legend="Country" className="mt-5">
              {countries.map((c) => (
                <Check key={c} name="country" value={c} label={c} checked={query.countries.includes(c)} />
              ))}
            </Group>
          )}
        </Disclosure>

        <Disclosure label="Budget" count={budgetCount}>
          <fieldset>
            <legend className="caps mb-3 text-[14px] text-muted">Price, US dollars</legend>
            <div className="flex items-center gap-3">
              <label className="flex-1">
                <span className="sr-only">Lowest price, dollars</span>
                <input
                  type="text"
                  inputMode="numeric"
                  name="min"
                  defaultValue={query.minCents === null ? "" : String(query.minCents / 100)}
                  placeholder="Least"
                  className="field w-full bg-ground px-3 py-2 text-[15px]"
                />
              </label>
              <span aria-hidden="true" className="text-muted">to</span>
              <label className="flex-1">
                <span className="sr-only">Highest price, dollars</span>
                <input
                  type="text"
                  inputMode="numeric"
                  name="max"
                  defaultValue={query.maxCents === null ? "" : String(query.maxCents / 100)}
                  placeholder="Most"
                  className="field w-full bg-ground px-3 py-2 text-[15px]"
                />
              </label>
            </div>
            <p className="mt-2 text-[14px] leading-[1.6] text-muted">
              A fixed-price option is matched on its price. A bidding option is matched on its opening bid, or on its take-it-now price where it has one.
            </p>
          </fieldset>
        </Disclosure>

        <Disclosure label="More filters" count={moreCount}>
          {purposes && purposes.tags.length > 0 && (
            <Group legend={purposes.facet.label}>
              {purposes.tags.map((t) => (
                <Check key={t.key} name="purpose" value={t.key} label={t.label} checked={query.purposes.includes(t.key)} />
              ))}
            </Group>
          )}
          {audiences && audiences.tags.length > 0 && (
            <Group legend={audiences.facet.label} className="mt-5">
              {audiences.tags.map((t) => (
                <Check key={t.key} name="audience" value={t.key} label={t.label} checked={query.audiences.includes(t.key)} />
              ))}
            </Group>
          )}
          <Group legend="How it is sold" className="mt-5">
            {SALE_FILTERS.map((s) => (
              <Check key={s.param} name="sale" value={s.param} label={s.label} checked={query.sales.includes(s.param)} />
            ))}
          </Group>
          <fieldset className="mt-5">
            <legend className="caps mb-3 text-[14px] text-muted">Timing</legend>
            <Check name="closing" value="soon" label="Closing within 7 days" checked={query.closingSoon} />
          </fieldset>
        </Disclosure>

        {/* Clearing lives with the chips below, one link beside what it clears, so it is not repeated here. */}
        <Button type="submit" className="px-5 py-3 max-lg:basis-full">Apply filters</Button>
      </div>
    </form>
  );
}

/**
 * One question, behind a control. Native <details>: keyboard-operable, needs no script, and keeps
 * its contents (and whatever was ticked in them) when closed. From 1024px the panel drops down over
 * the page as a menu; below that it opens in place.
 */
function Disclosure({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return (
    <details className="group relative max-lg:basis-full">
      <summary className="discovery-summary field flex h-full min-h-[46px] cursor-pointer select-none items-center gap-2.5 bg-panel px-4 text-[15px] text-ink transition-colors hover:border-ink group-open:border-accent-line">
        <span>{label}</span>
        {count > 0 && (
          <span className="caps text-[14px] text-accent-ink">
            <span className="sr-only">, </span>{count}<span className="sr-only"> chosen</span>
          </span>
        )}
        <span aria-hidden="true" className="ml-auto text-muted transition-transform group-open:rotate-180"><Chevron /></span>
      </summary>
      <div className="glow mt-2 bg-ground p-5 lg:absolute lg:left-0 lg:top-full lg:z-30 lg:w-[320px]">{children}</div>
    </details>
  );
}

function Group({ legend, children, className = "" }: { legend: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={className}>
      <legend className="caps mb-3 text-[14px] text-muted">{legend}</legend>
      <div className="flex flex-col gap-2">{children}</div>
    </fieldset>
  );
}

function Check({ name, value, label, checked }: { name: string; value: string; label: string; checked: boolean }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-[15px]">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={checked}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

const SHARED = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

function SearchIcon() {
  return (
    <svg {...SHARED}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4.5 4.5" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg {...SHARED} width={14} height={14}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
