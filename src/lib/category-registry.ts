import { supabaseServer } from "@/lib/supabase/server";

/**
 * What each category is called, from the registry in the database.
 *
 * src/lib/categories.ts holds the words a category uses for its own organizer and details. The
 * category's name is not one of them: it lives in fundraiser_categories, so a fifth category is
 * named correctly on every public page the day it is inserted, with no second list to keep in step.
 * anon may read the key and the label and nothing else (migration 0043).
 *
 * A key with no row gets no label, and the caller leaves the name out instead of inventing one.
 * The names the registry holds (migrations 0038, 0047 and 0049) stand in before a database is
 * connected, the way src/lib/sample.ts stands in for the fundraisers. A name here opens nothing:
 * whether a category may save a draft, publish or be paid for is decided in the database.
 */
const SEEDED: Record<string, string> = {
  music: "Music",
  sports: "Sports teams",
  film: "Film",
  theater: "Theater",
  hospitality: "Restaurants & hospitality",
  other: "Other",
};

const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export async function getCategoryLabels(): Promise<Record<string, string>> {
  if (!configured()) return SEEDED;
  const sb = await supabaseServer();
  const { data } = await sb.from("fundraiser_categories").select("key,label");
  const out: Record<string, string> = {};
  for (const row of (data ?? []) as { key: string; label: string }[]) out[row.key] = row.label;
  return out;
}
