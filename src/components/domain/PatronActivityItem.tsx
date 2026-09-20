import Link from "next/link";
import { categoryLabel } from "@/lib/category-words";
import type { PatronActivityView } from "@/lib/domain";

/** A sponsorship and a backing are different things, and keep different names. */
const SUPPORT_LABEL = { sponsorship: "Sponsorship", backing: "Backing" } as const;

/**
 * One thing a patron chose to show: who, which fundraiser, what kind of support, its category and
 * when. No amount, because the view carries none. The category is the fundraiser's own.
 */
export function PatronActivityItem({ item }: { item: PatronActivityView }) {
  return (
    <li className="grid gap-1.5 py-5 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-6">
      <div className="min-w-0">
        <b className="block text-[16px] font-medium">
          {item.organizerHref ? (
            <Link href={item.organizerHref} className="text-accent-ink underline decoration-1 underline-offset-4">
              {item.organizerName}
            </Link>
          ) : (
            item.organizerName
          )}
          , {item.fundraiserTitle}
        </b>
        <span className="block text-[14.5px] text-muted">{item.detail}</span>
      </div>
      <span className="caps text-[14px] text-muted sm:justify-self-end sm:text-right">
        {SUPPORT_LABEL[item.support]} <span aria-hidden="true">&middot;</span>{" "}
        {item.category && (
          <>
            {categoryLabel(item.category)} <span aria-hidden="true">&middot;</span>{" "}
          </>
        )}
        {item.month}
      </span>
    </li>
  );
}
