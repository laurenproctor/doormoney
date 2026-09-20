import type { SupabaseClient } from "@supabase/supabase-js";
import { catalogTemplates, templateFromRow, type OpportunityTemplate, type TemplateRow } from "@/lib/opportunities";

/**
 * A category's sponsorship option templates, from the registry in the database.
 *
 * `surfaces` is public to read (migration 0001) and carries a category on every row (0040), so it
 * is the list of what a category can offer. Reading it here, and not from src/lib/catalog.ts, is
 * what lets a category be added with rows instead of a release.
 *
 * Retired templates come back too, marked inactive: a fundraiser that already offers one still
 * has to be able to name it and save it. templatesForFundraiser leaves them out of what is new.
 *
 * Falls back to the catalog file when the read fails or returns nothing for a category the file
 * knows. That covers running with no database, and it covers this code deployed before migration
 * 0044, where `active` and `version` do not exist yet: the editor then behaves exactly as it did.
 * The database still refuses a mismatched lot either way, once 0044 is applied.
 */
export async function loadTemplates(sb: SupabaseClient, categoryKey: string): Promise<OpportunityTemplate[]> {
  const fallback = () => catalogTemplates().filter((t) => t.category === categoryKey);
  try {
    const { data, error } = await sb
      .from("surfaces")
      .select("key,name,group_key,category_key,applies_to,default_price_cents,default_period,seen_by,sort,active,version")
      .eq("category_key", categoryKey)
      .order("sort");
    if (error || !data || data.length === 0) return fallback();
    return (data as TemplateRow[]).map(templateFromRow);
  } catch {
    return fallback();
  }
}
