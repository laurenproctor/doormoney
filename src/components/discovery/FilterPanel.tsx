import { Button, ButtonLink } from "@/components/Button";
import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { SALE_FILTERS, hasFilters, type DiscoveryQuery } from "@/lib/discovery-filters";
import type { DiscoveryChoice } from "@/lib/discovery";

/**
 * Everything a sponsor can narrow by, as one plain GET form.
 *
 * A server component with no state of its own: submitting reloads /fundraisers with the choices in
 * the address, which is what makes a filtered page shareable and what makes the back button work.
 * There is no client-side filtering to fall out of step with the server's answer.
 *
 * On a phone the panel collapses behind one control; from 1024px up it is a rail that is always
 * open. Both are the same markup and the same form, so nothing is submitted twice. The toggle is a
 * checkbox with no `name`, which is how it stays out of the form data it sits beside.
 *
 * Every question here reads a structured field. There is no free-text search over a fundraiser's
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
  const active = hasFilters(query);
  return (
    <section aria-labelledby="filters-heading" className="lg:sticky lg:top-6">
      <input type="checkbox" id="filters-toggle" className="peer sr-only" aria-hidden="true" tabIndex={-1} />
      <div className="flex items-center justify-between gap-4 lg:block">
        <h2 id="filters-heading" className="caps text-[14.5px] text-accent-ink">
          Narrow the list
        </h2>
        <label
          htmlFor="filters-toggle"
          className="caps edge cursor-pointer bg-panel px-4 py-2 text-[14px] lg:hidden"
        >
          Filters
        </label>
      </div>

      <div className="hidden peer-checked:block lg:mt-5 lg:block">
        <form method="get" action="/fundraisers" className="mt-5 lg:mt-0">
          {/* The sort survives a change of filters. Left out at the default so the address stays short. */}
          {query.sort !== "relevant" && <input type="hidden" name="sort" value={query.sort} />}

          <Group legend="Category">
            {categories.map((c) => (
              <Check key={c.key} name="category" value={c.key} label={c.label} checked={query.categories.includes(c.key)} />
            ))}
          </Group>

          <Group legend="Where it happens">
            {(["in_person", "online", "hybrid"] as const).map((m) => (
              <Check key={m} name="mode" value={m} label={ACTIVITY_MODE_LABEL[m]} checked={query.modes.includes(m)} />
            ))}
          </Group>

          <fieldset className="mb-6">
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
            <p className="mt-2 text-[14px] text-muted">
              Matched against where the activity happens, not where the organizer is based.
            </p>
          </fieldset>

          {countries.length > 0 && (
            <Group legend="Country">
              {countries.map((c) => (
                <Check key={c} name="country" value={c} label={c} checked={query.countries.includes(c)} />
              ))}
            </Group>
          )}

          {facets.map(({ facet, tags }) => (
            <Group key={facet.key} legend={facet.label}>
              {tags.map((t) => (
                <Check
                  key={t.key}
                  name={facet.key === "funding_purpose" ? "purpose" : "audience"}
                  value={t.key}
                  label={t.label}
                  checked={(facet.key === "funding_purpose" ? query.purposes : query.audiences).includes(t.key)}
                />
              ))}
            </Group>
          ))}

          <fieldset className="mb-6">
            <legend className="caps mb-3 text-[14px] text-muted">Price</legend>
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
            <p className="mt-2 text-[14px] text-muted">
              US dollars. A fixed-price option is matched on its price and a bidding option on where the bidding starts.
            </p>
          </fieldset>

          <Group legend="How it is sold">
            {SALE_FILTERS.map((s) => (
              <Check key={s.param} name="sale" value={s.param} label={s.label} checked={query.sales.includes(s.param)} />
            ))}
          </Group>

          <fieldset className="mb-6">
            <legend className="caps mb-3 text-[14px] text-muted">Timing</legend>
            <Check name="closing" value="soon" label="Closing within 7 days" checked={query.closingSoon} />
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit">Apply filters</Button>
            {active && (
              <ButtonLink href="/fundraisers" variant="ghost">
                Clear all
              </ButtonLink>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}

function Group({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-6">
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
