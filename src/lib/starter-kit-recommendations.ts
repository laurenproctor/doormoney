import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActType } from "@/lib/catalog";
import { templatesForFundraiser, type OpportunityTemplate } from "@/lib/opportunities";
import { loadTemplates } from "@/lib/opportunity-templates";
import { starterKitGroups, suggestedTemplates, type KitCategory, type StarterKit } from "@/lib/starter-kits";

/** A sponsorship option a kit points at: the registry's name and where it is seen. No price, ever. */
export type KitRecommendation = { key: string; name: string; seenBy: string | null };

/**
 * The options one kit recommends, from the templates this fundraiser could actually offer.
 *
 * Names only. A suggested price is deliberately not carried, even in music where one exists: a
 * recommendation is a pointer, and the price belongs to the options editor and to the organizer.
 */
export function kitRecommendations(kit: StarterKit, templates: readonly OpportunityTemplate[], actType: ActType | null): KitRecommendation[] {
  const offerable = templatesForFundraiser(templates, kit.categoryKey, actType);
  return suggestedTemplates(kit, offerable).map((t) => ({ key: t.key, name: t.name, seenBy: t.seenBy }));
}

/**
 * Recommendations for every kit an organizer can pick, by kit key.
 *
 * This is the one place starter kits meet the template registry. It reads templates the way the
 * options editor does (loadTemplates, then templatesForFundraiser) and writes nothing: no lot is
 * made because a kit recommends an option.
 */
export async function loadKitRecommendations(sb: SupabaseClient, categories: readonly KitCategory[], actType: ActType | null): Promise<Record<string, KitRecommendation[]>> {
  const out: Record<string, KitRecommendation[]> = {};
  await Promise.all(
    starterKitGroups(categories).map(async (group) => {
      const templates = await loadTemplates(sb, group.category.key);
      for (const { kit } of group.kits) out[kit.key] = kitRecommendations(kit, templates, actType);
    }),
  );
  return out;
}
