import { categoryLabel } from "@/lib/category-words";
import type { Category } from "@/lib/domain";

/** A fundraiser's category, by name. The name is data from the registry, so a fifth category needs nothing here. */
export function CategoryBadge({ category, className = "" }: { category: Category; className?: string }) {
  return (
    <span data-category={category.key} className={`caps edge inline-block bg-panel px-3 py-1.5 text-[14px] text-accent-ink ${className}`}>
      {categoryLabel(category)}
    </span>
  );
}
