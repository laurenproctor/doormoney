import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { CategoryBadge, LocationSummary } from "@/components/domain";
import { OrganizerPhoto } from "@/components/discovery/OrganizerPhoto";
import { formatMoney } from "@/lib/money";
import { closeStamp } from "@/lib/dates";
import type { PriceRoute, PricedRoute } from "@/lib/discovery-filters";
import type { DiscoveryCardView, DiscoveryPreview } from "@/lib/discovery-query";

/**
 * One fundraiser, as a sponsor meets it in the list, in either layout.
 *
 * Only public, organizer-provided facts: who is raising, what the funding enables, where it
 * happens, which options matched and where each puts the sponsor, who it reaches, what the options
 * cost and how they are sold. Nothing about a patron, a bid, a fee, a payment, evidence or a
 * policy, because none of that is in the views this page reads.
 *
 * What is not known is not drawn. A fundraiser with no photo, no location, no tags, no stated
 * audience, no promise or no price simply has fewer lines; there is no placeholder, no stock image
 * and no zero standing in for an unknown. The prices are the organizer's own numbers, never a
 * template's suggestion, and each is labelled for the buying route it is.
 *
 * One markup for both layouts. Tiles are the default; the `discovery-rows` variant (globals.css)
 * reads the attribute the reader's choice sets on <html> and re-lays the same elements, so there is
 * never a second copy of a card and the two views cannot disagree about what is in it.
 */
export function DiscoveryCard({
  card,
  categoryLabel,
  tagLabels,
  filtersActive,
}: {
  card: DiscoveryCardView;
  categoryLabel: string | null;
  /** The chosen discovery keys in words, already narrowed to the ones the registry knows. */
  tagLabels: string[];
  /** True when the count shown should be "matching", rather than simply what is open. */
  filtersActive: boolean;
}) {
  const prices = priceLines(card);
  const hasOffers = card.availableOffers > 0;
  return (
    <li className="discovery-rows:grid discovery-rows:grid-cols-[72px_1fr] discovery-rows:gap-x-5 discovery-rows:border-0 discovery-rows:border-b discovery-rows:border-line discovery-rows:bg-transparent discovery-rows:py-6 discovery-rows:md:grid-cols-[220px_1fr_260px] discovery-rows:md:gap-x-8 edge flex flex-col bg-panel">
      {/* The organizer's photo, where they added one. A picture of who is raising, never documentation of the work. */}
      {card.organizerPhotoUrl && (
        <OrganizerPhoto
          src={card.organizerPhotoUrl}
          frameClassName="discovery-rows:aspect-square discovery-rows:w-[72px] discovery-rows:md:aspect-[4/3] discovery-rows:md:w-full aspect-[16/9] w-full overflow-hidden bg-ground"
          className="h-full w-full object-cover"
        />
      )}

      <div className={`discovery-rows:px-0 discovery-rows:py-0 flex flex-1 flex-col gap-3.5 px-[26px] pt-6 ${card.organizerPhotoUrl ? "" : "discovery-rows:col-span-2 discovery-rows:md:col-span-1 discovery-rows:md:col-start-2"}`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <CategoryBadge category={{ key: card.categoryKey, label: categoryLabel }} />
          {card.closingSoon && (
            <span className="caps edge inline-block bg-panel px-3 py-1.5 text-[14px] text-accent-ink">Closing soon</span>
          )}
        </div>

        <div>
          <h3 className="heading text-[clamp(24px,3vw,30px)] leading-[1.08]">
            <Link href={card.href} className="text-ink no-underline hover:text-accent-ink">{card.title}</Link>
          </h3>
          <p className="mt-1 text-[15px] text-muted">
            by <Link href={card.organizerHref} className="text-ink underline decoration-1 underline-offset-4 hover:text-accent-ink">{card.organizerName}</Link>
          </p>
        </div>

        {card.purpose && <p className="text-[15px] leading-[1.6]">{card.purpose}</p>}

        <LocationSummary locations={card.locations} activityMode={card.activityMode} className="text-muted" />

        {tagLabels.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {tagLabels.map((label) => (
              <li key={label} className="caps edge bg-transparent px-2.5 py-1 text-[14px] text-muted">
                {label}
              </li>
            ))}
          </ul>
        )}

        {card.previews.length > 0 && (
          <div className="border-t border-line pt-3.5">
            <div className="caps text-[14px] text-accent-ink">Sponsorship options include</div>
            <ul className="mt-2 grid gap-2">
              {card.previews.map((p) => (
                <Preview key={p.id} preview={p} />
              ))}
            </ul>
            {card.matchingOffers > card.previews.length && (
              <p className="mt-2 text-[14px] text-muted">
                and {card.matchingOffers - card.previews.length} more
              </p>
            )}
          </div>
        )}

        {card.sponsorPromise && (
          <div className="border-t border-line pt-3.5">
            <div className="caps text-[14px] text-accent-ink">Sponsor visibility</div>
            <p className="mt-1.5 text-[15px] leading-[1.6]">{card.sponsorPromise}</p>
          </div>
        )}

        {card.audience && (
          <p className="text-[15px] leading-[1.6] text-muted">
            <span className="caps text-[14px]">Audience</span>
            <span className="block">{card.audience}</span>
          </p>
        )}
      </div>

      <div className={`discovery-rows:mt-0 discovery-rows:border-0 discovery-rows:px-0 discovery-rows:pb-0 discovery-rows:pt-4 discovery-rows:md:border-l discovery-rows:md:border-line discovery-rows:md:pl-8 discovery-rows:md:pt-0 mt-auto flex flex-col gap-3.5 border-t border-line px-[26px] pb-7 pt-4 ${card.organizerPhotoUrl ? "discovery-rows:col-start-2 discovery-rows:md:col-start-3" : "discovery-rows:col-span-2 discovery-rows:md:col-span-1 discovery-rows:md:col-start-3"}`}>
        <div className="flex flex-wrap gap-x-6 gap-y-3 discovery-rows:md:flex-col discovery-rows:md:gap-y-2.5">
          {prices.map((p) => (
            <Stat key={p.label} value={p.value} label={p.label} />
          ))}
          <p className="text-[14.5px] leading-[1.5] text-muted">{availabilityText(card, filtersActive)}</p>
        </div>

        {/*
          The real close, with its zone named. Every close time on the site is shown in Eastern and
          says "ET" rather than implying the reader's own clock: the product contract asks for
          explicit time-zone meaning, and a silent local reading is the thing it warns against.
        */}
        {card.closesAt && (
          <p className="text-[14.5px] text-muted">
            {card.hasBidding ? "Bidding closes" : "Closes"} {closeStamp(card.closesAt)}
          </p>
        )}

        {/* A fundraiser with nothing open to buy is still a page worth reading; it is not offered as a purchase. */}
        {hasOffers ? (
          <ButtonLink href={card.href} className="mt-1 self-start whitespace-nowrap px-5 py-3">View sponsorships</ButtonLink>
        ) : (
          <ButtonLink href={card.href} variant="ghost" className="mt-1 self-start whitespace-nowrap px-5 py-3">See the project</ButtonLink>
        )}
      </div>
    </li>
  );
}

/**
 * One matching option: its own name, where the sponsor appears if the organizer wrote it, and its
 * own numbers. The price beside a preview is that option's, never the cheapest on the card, and a
 * route outside the budget is not listed.
 */
function Preview({ preview }: { preview: DiscoveryPreview }) {
  return (
    <li className="text-[15px] leading-[1.5]">
      <span className="font-medium">{preview.name}</span>
      {preview.placement && <span className="text-muted">: {preview.placement}</span>}
      <span className="block text-[14.5px] text-muted">{preview.routes.map(routeText).join(", or ")}</span>
    </li>
  );
}

const ROUTE_WORD: Record<PriceRoute, string> = { fixed: "fixed price", opening_bid: "opening bid", buy_now: "take it now" };

function routeText(r: PricedRoute): string {
  return `${formatMoney(r.cents)} ${ROUTE_WORD[r.route]}`;
}

/**
 * The prices, one line per buying route, each labelled for what it is.
 *
 * Built from the organizer's own numbers on the options that matched, and only from the routes
 * that fit the sponsor's budget. A fixed price, an opening bid and a take-it-now number are never
 * folded into one range: "from $150" over an opening bid is not a price anybody is promised, and
 * a take-it-now that sits outside the budget is not listed as inside it.
 */
function priceLines(card: DiscoveryCardView): { value: string; label: string }[] {
  const { fixed, openingBid, buyNow } = card.pricing;
  const span = (s: { fromCents: number; toCents: number }) =>
    s.fromCents === s.toCents ? formatMoney(s.fromCents) : `${formatMoney(s.fromCents)} to ${formatMoney(s.toCents)}`;
  const lines: { value: string; label: string }[] = [];
  if (fixed) lines.push({ value: span(fixed), label: fixed.fromCents === fixed.toCents ? "fixed price" : "fixed prices" });
  if (openingBid) lines.push({ value: span(openingBid), label: openingBid.fromCents === openingBid.toCents ? "opening bid" : "opening bids" });
  if (buyNow) lines.push({ value: span(buyNow), label: "take it now" });
  return lines;
}

/** How many options are open, or how many of them match. Options, never spots: discovery does not read spots. */
function availabilityText(card: DiscoveryCardView, filtersActive: boolean): string {
  if (card.availableOffers === 0) return "No sponsorship options open right now";
  const options = (n: number) => (n === 1 ? "1 sponsorship option" : `${n} sponsorship options`);
  if (filtersActive && card.matchingOffers !== card.availableOffers) {
    return `${card.matchingOffers} of ${options(card.availableOffers)} match`;
  }
  return `${options(card.availableOffers)} open`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="heading block text-[22px] leading-none">{value}</b>
      <span className="caps text-[14px] text-muted">{label}</span>
    </div>
  );
}
