import Link from "next/link";
import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { formatMoney } from "@/lib/money";
import { SALE_FILTERS, hrefWithout, hasFilters, type DiscoveryQuery } from "@/lib/discovery-filters";

/**
 * What is currently narrowing the list, each one removable on its own.
 *
 * Every chip is a plain link to the same page with that one value dropped, so removing a filter
 * needs no JavaScript and leaves a real address in the bar. Labels come from the registry, so a
 * chip for a category or a tag this build has no words for still reads as its own name rather than
 * a raw key.
 */
export function ActiveFilters({
  query,
  labels,
}: {
  query: DiscoveryQuery;
  /** Registry words, by key: category labels and discovery tag labels in one map. */
  labels: Record<string, string>;
}) {
  if (!hasFilters(query)) return null;
  const word = (key: string) => labels[key] ?? key;

  const chips: { key: string; label: string; href: string }[] = [
    ...query.categories.map((c) => ({ key: `category-${c}`, label: word(c), href: hrefWithout(query, "categories", c) })),
    ...query.modes.map((m) => ({ key: `mode-${m}`, label: ACTIVITY_MODE_LABEL[m] ?? m, href: hrefWithout(query, "modes", m) })),
    ...query.countries.map((c) => ({ key: `country-${c}`, label: c, href: hrefWithout(query, "countries", c) })),
    ...query.purposes.map((t) => ({ key: `purpose-${t}`, label: word(t), href: hrefWithout(query, "purposes", t) })),
    ...query.audiences.map((t) => ({ key: `audience-${t}`, label: word(t), href: hrefWithout(query, "audiences", t) })),
    ...query.sales.map((s) => ({
      key: `sale-${s}`,
      label: SALE_FILTERS.find((f) => f.param === s)?.label ?? s,
      href: hrefWithout(query, "sales", s),
    })),
  ];

  if (query.q) chips.push({ key: "q", label: `Named “${query.q}”`, href: hrefWithout(query, "q") });
  if (query.place) chips.push({ key: "place", label: query.place, href: hrefWithout(query, "place") });
  if (query.minCents !== null) {
    chips.push({ key: "min", label: `From ${formatMoney(query.minCents)}`, href: hrefWithout(query, "minCents") });
  }
  if (query.maxCents !== null) {
    chips.push({ key: "max", label: `Up to ${formatMoney(query.maxCents)}`, href: hrefWithout(query, "maxCents") });
  }
  if (query.closingSoon) {
    chips.push({ key: "closing", label: "Closing within 7 days", href: hrefWithout(query, "closingSoon") });
  }

  return (
    <div className="mb-7 flex flex-wrap items-center gap-2.5">
      <span className="caps text-[14px] text-muted">Filtering by</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="caps edge inline-flex items-center gap-2 bg-panel px-3 py-1.5 text-[14px] text-ink no-underline hover:border-accent-ink hover:text-accent-ink"
        >
          {chip.label}
          <span aria-hidden="true" className="text-[15px] leading-none">&times;</span>
          <span className="sr-only">, remove this filter</span>
        </Link>
      ))}
      <Link href="/fundraisers" className="caps text-[14px] text-accent-ink underline decoration-1 underline-offset-4">
        Clear all
      </Link>
    </div>
  );
}
