import { ButtonLink } from "@/components/Button";
import { CategoryBadge, LocationSummary } from "@/components/domain";
import { formatMoney } from "@/lib/money";
import { closeStamp } from "@/lib/dates";
import type { DiscoveryCardView } from "@/lib/discovery-query";

/**
 * One fundraiser, as a sponsor meets it in the list.
 *
 * Only public, organizer-provided facts: who is raising, what the funding enables, who it reaches,
 * where it happens, what the options cost and how they are sold. Nothing about a patron, a bid, a
 * fee, a payment, evidence or a policy, because none of that is in the views this page reads.
 *
 * What is not known is not drawn. A fundraiser with no location, no tags, no stated audience or no
 * price simply shows fewer lines; there is no placeholder, no "uncategorized" and no zero standing
 * in for an unknown. The prices are the organizer's own numbers and never a template's suggestion.
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
  const priceLine = priceText(card);
  return (
    <article className="edge flex flex-col gap-3.5 bg-panel px-[26px] py-7">
      <div className="flex flex-wrap items-center gap-2.5">
        <CategoryBadge category={{ key: card.categoryKey, label: categoryLabel }} />
        {card.closingSoon && (
          <span className="caps edge inline-block bg-panel px-3 py-1.5 text-[14px] text-accent-ink">Closing soon</span>
        )}
      </div>

      <div>
        <div className="caps text-[14.5px] text-accent-ink">{card.organizerName}</div>
        <h3 className="heading mt-1 text-[clamp(26px,3.4vw,34px)] leading-[1.05]">{card.title}</h3>
      </div>

      {card.purpose && <p className="text-[15px] leading-[1.6]">{card.purpose}</p>}
      {card.audience && <p className="text-[15px] leading-[1.6] text-muted">Reaches {lowerFirst(card.audience)}</p>}

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

      <div className="flex flex-wrap gap-x-7 gap-y-3 border-t border-line pt-3.5">
        {priceLine && <Stat value={priceLine} label={card.hasBidding && !card.hasFixed ? "bidding starts at" : "sponsorships from"} />}
        <Stat
          value={String(filtersActive ? card.matchingOffers : card.availableOffers)}
          label={filtersActive ? countWord(card.matchingOffers, "match", "matches") : countWord(card.availableOffers, "option open", "options open")}
        />
        {saleText(card) && <Stat value={saleText(card)!} label="sold as" />}
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

      <ButtonLink href={card.href} className="mt-1 self-start">
        See the fundraiser
      </ButtonLink>
    </article>
  );
}

/**
 * The price, as a range when the options differ and one number when they do not.
 *
 * Built from the organizer's own numbers on the options that matched. A bidding option contributes
 * where its bidding starts, and its take-it-now price too where it has one, because both are real
 * numbers a sponsor could pay.
 */
function priceText(card: DiscoveryCardView): string | null {
  if (card.priceFromCents === null || card.priceToCents === null) return null;
  return card.priceFromCents === card.priceToCents
    ? formatMoney(card.priceFromCents)
    : `${formatMoney(card.priceFromCents)}–${formatMoney(card.priceToCents)}`;
}

function saleText(card: DiscoveryCardView): string | null {
  if (card.hasFixed && card.hasBidding) return "Fixed price and bidding";
  if (card.hasFixed) return "Fixed price";
  if (card.hasBidding) return "Bidding";
  return null;
}

const countWord = (n: number, one: string, many: string) => (n === 1 ? one : many);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <b className="heading block text-[22px] leading-none">{value}</b>
      <span className="caps text-[14px] text-muted">{label}</span>
    </div>
  );
}
