import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { SITE } from "@/lib/site";

/*
  Place suggestions for the one location field on a profile.

  It proxies OpenStreetMap's Nominatim rather than letting the browser call it, for three reasons.
  The visitor's IP and their half-typed location never reach a third party: this server asks, on
  their behalf, and Nominatim sees one machine. Nominatim's usage policy wants a real identifying
  User-Agent, which a browser cannot set. And it keeps the dependency in one file, so swapping in
  a paid geocoder later is a change here and nowhere else.

  Signed in only, because the only field that uses it is behind an account, and an open geocoding
  proxy is somebody else's rate limit to burn. Nothing is stored: no query is logged and no result
  is cached in our database.

  What comes back is a list of strings for a datalist. The field itself stays free text, so a
  place Nominatim has never heard of is still a valid answer.
*/

const Query = z.object({ q: z.string().trim().min(3).max(80) });

/** Nominatim asks for a real contact in the User-Agent. This is that. */
const AGENT = `${SITE.name} (${SITE.url})`;

export const runtime = "nodejs";

export async function GET(request: Request) {
  // An account, because this is a convenience on a signed-in form and not a public API.
  const user = await currentUser().catch(() => null);
  if (!user) return NextResponse.json({ places: [] }, { status: 401 });

  const parsed = Query.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return NextResponse.json({ places: [] });

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", parsed.data.q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "6");
  // Places people live and work in, never a house number: this field is a city, a region or a
  // country, and decision 11 says never a street address.
  url.searchParams.set("featureType", "settlement");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": AGENT, Accept: "application/json" },
      // One hour. The same three letters from the next person cost Nominatim nothing.
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      console.error("places: nominatim answered", response.status);
      return NextResponse.json({ places: [] });
    }
    const rows = (await response.json()) as NominatimRow[];
    return NextResponse.json({ places: rows.map(placeLabel).filter((p): p is string => Boolean(p)).slice(0, 6) });
  } catch (error) {
    // A geocoder that is slow or down is not an error the person needs to see: the field is free
    // text and works perfectly well with no suggestions at all.
    console.error("places: lookup failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ places: [] });
  }
}

type NominatimRow = {
  name?: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
};

/**
 * "Austin, Texas, United States", or "Lisbon, Portugal" where there is no useful middle.
 *
 * Built from the parts rather than from `display_name`, which carries counties, postcodes and
 * occasionally a street. Three parts at most: nobody writes their county on a profile.
 */
function placeLabel(row: NominatimRow): string | null {
  const a = row.address ?? {};
  const city = row.name || a.city || a.town || a.village || a.municipality || null;
  if (!city) return null;
  const region = a.state || a.province || a.region || null;
  const country = a.country || null;
  return [city, region, country].filter(Boolean).join(", ");
}
