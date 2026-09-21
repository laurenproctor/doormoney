import type { FundraiserView } from "@/lib/domain";
import { CategoryBadge } from "./CategoryBadge";
import { FundraiserStatus } from "./FundraiserStatus";
import { LocationSummary } from "./LocationSummary";

/**
 * One fundraiser, named: its category, its title, where it stands and its one line of facts. The
 * facts arrive already worded, because only the category knows whether it counts shows.
 */
export function FundraiserHeader({ fundraiser, organizerName, as: Heading = "h2" }: { fundraiser: FundraiserView; organizerName?: string; as?: "h1" | "h2" | "h3" }) {
  return (
    <header>
      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <CategoryBadge category={fundraiser.category} />
        <FundraiserStatus status={fundraiser.status} />
      </p>
      <Heading className="heading text-[clamp(22px,3vw,32px)] leading-[1.1]">
        <a href={fundraiser.href} className="underline decoration-1 underline-offset-[6px] hover:text-accent-ink">
          {fundraiser.title}
        </a>
      </Heading>
      {organizerName && <p className="mt-2 text-[15px] text-muted">{organizerName}</p>}
      {fundraiser.facts && <p className="caps mt-3 text-[14px] text-muted">{fundraiser.facts}</p>}
      <LocationSummary locations={fundraiser.locations} activityMode={fundraiser.activityMode} className="mt-2 text-muted" />
    </header>
  );
}
