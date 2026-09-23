/**
 * Countries, by the code the database already stores.
 *
 * `acts.country_code` has always been two letters, and the discovery contract derives
 * `runs.activity_country_codes` from the same shape, so the stored value does not change here.
 * What changes is that nobody is asked to type it: the form offers names and saves the code.
 *
 * The names come from `Intl.DisplayNames`, which every runtime this app targets carries, so no
 * list of names is kept here to go stale and no geocoding service is called. A runtime that
 * cannot answer gets the code back, which is what the field showed before.
 *
 * The list is ISO 3166-1 alpha-2. It is not a list of countries Door Money can pay into: that is
 * Stripe's answer, given at payout setup, and this field is only where somebody works.
 */

export const COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE",
  "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF",
  "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM",
  "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC",
  "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA",
  "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG",
  "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS",
  "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO",
  "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}

const names = (() => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return null;
  }
})();

/** What to call a country, or the code itself when the runtime has no name for it. */
export function countryName(code: string): string {
  const key = code.trim().toUpperCase();
  if (!key) return "";
  try {
    return names?.of(key) ?? key;
  } catch {
    return key;
  }
}

/** Every country, named and sorted the way a reader reads them. Built once. */
export const COUNTRY_OPTIONS: { code: string; name: string }[] = COUNTRY_CODES
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

/**
 * A place in one line: "Chicago, United States".
 *
 * Whatever is missing is left out rather than stood in for, so an organizer who gave a city and no
 * country reads as that city. Nothing is guessed from the parts that are there.
 */
export function placeLine(parts: { city?: string | null; region?: string | null; countryCode?: string | null }): string | null {
  const line = [parts.city, parts.region, parts.countryCode ? countryName(parts.countryCode) : null]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  return line || null;
}
