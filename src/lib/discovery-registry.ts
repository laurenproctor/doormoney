import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { EMPTY_REGISTRY, type DiscoveryFacet, type DiscoveryRegistry, type DiscoveryTag } from "@/lib/discovery";

/**
 * The discovery registry, from the database.
 *
 * src/lib/discovery.ts holds the rules and the shapes and stays pure. This reads the two registry
 * tables, the way src/lib/category-registry.ts reads `fundraiser_categories` and
 * src/lib/opportunity-templates.ts reads `surfaces`.
 *
 * There is no list of facets or tags standing in here when no database is connected, unlike the
 * category names, and that is deliberate: the only surface that needs these words today is the
 * organizer's own draft form, which is behind an account and therefore behind a database. An empty
 * registry draws no discovery questions rather than questions whose answers could not be saved.
 *
 * anon and authenticated may read both tables and write neither (migration 0053).
 */

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type FacetRow = {
  key: string; label: string; prompt: string | null;
  on_fundraiser: boolean; on_template: boolean; max_tags: number; sort: number;
};
type TagRow = {
  key: string; facet_key: string; label: string; help: string | null;
  category_keys: string[] | null; active: boolean; sort: number;
};

const facet = (row: FacetRow): DiscoveryFacet => ({
  key: row.key, label: row.label, prompt: row.prompt,
  onFundraiser: row.on_fundraiser, onTemplate: row.on_template,
  maxTags: row.max_tags, sort: row.sort,
});

const tag = (row: TagRow): DiscoveryTag => ({
  key: row.key, facetKey: row.facet_key, label: row.label, help: row.help,
  categoryKeys: row.category_keys, active: row.active, sort: row.sort,
});

export async function getDiscoveryRegistry(client?: SupabaseClient): Promise<DiscoveryRegistry> {
  if (!client && !configured()) return EMPTY_REGISTRY;
  const sb = client ?? (await supabaseServer());
  const [facets, tags] = await Promise.all([
    sb.from("discovery_facets").select("key,label,prompt,on_fundraiser,on_template,max_tags,sort").order("sort"),
    sb.from("discovery_tags").select("key,facet_key,label,help,category_keys,active,sort").order("sort"),
  ]);
  // A registry that will not load is an empty one. The form then asks nothing, and the database
  // still refuses anything invalid, so a failed read cannot become a saved wrong answer.
  if (facets.error || tags.error) return EMPTY_REGISTRY;
  return {
    facets: ((facets.data ?? []) as FacetRow[]).map(facet),
    tags: ((tags.data ?? []) as TagRow[]).map(tag),
  };
}
