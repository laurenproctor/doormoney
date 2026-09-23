import { ACTIVITY_MODE_LABEL } from "@/lib/category-words";
import { placeLine } from "@/lib/countries";
import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { initialsFor } from "@/lib/organizer-setup";

/*
  The draft, read the way a sponsor would read it, while it is being written.

  Every line is what the form holds right now and nothing else. A part that has not been written is
  named as missing, in words, rather than filled with an example: an invented audience or a sample
  goal would look like a fact, and the whole point of the page this previews is that it states
  facts. The label at the top says it is private, because it is: nothing here is published, and
  nothing is saved by looking at it.

  The cover is the organizer's photograph when there is one, because that is the image the public
  fundraiser page draws today (HeroArt, on the board). A fundraiser has no image of its own yet, so
  without a photograph the cover is the room and its light: a placeholder that is plainly one.
*/

export type PreviewOrganizer = {
  name: string | null;
  /** The organizer's public photograph, from the public bucket, or null. */
  photoUrl: string | null;
  /** What the organizer said they are, or null when nobody said. */
  kindLabel: string | null;
};

export type PreviewLocation = { city?: string | null; region?: string | null; country_code?: string | null };

export type DraftPreviewInput = {
  categoryLabel: string | null;
  organizer: PreviewOrganizer;
  title: string;
  description: string;
  audience: string;
  purpose: string;
  sponsorPromise: string;
  /** The goal as typed, in dollars, or "" for none. Shown only when it parses. */
  goalAmount: string;
  activityMode: string;
  locations: PreviewLocation[];
  fundraisingStartsOn: string;
  fundraisingEndsOn: string;
  activityStartsOn: string;
  activityEndsOn: string;
};

/** Whole cents from a dollars string, or null when it is empty or not a money amount. */
export function previewGoalCents(amount: string): number | null {
  const trimmed = amount.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed)) return null;
  const [dollars, cents = ""] = trimmed.split(".");
  return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
}

const present = (v: string) => v.trim().length > 0;

export function FundraiserDraftPreview({ input, className = "" }: { input: DraftPreviewInput; className?: string }) {
  const { organizer } = input;
  const goalCents = previewGoalCents(input.goalAmount);
  const places = input.locations.map((l) => placeLine({ city: l.city, region: l.region, countryCode: l.country_code })).filter(Boolean);
  const mode = input.activityMode ? (ACTIVITY_MODE_LABEL[input.activityMode] ?? null) : null;
  const kicker = [input.categoryLabel, organizer.name ? `By ${organizer.name}` : null].filter(Boolean).join(" · ");

  return (
    <aside aria-label="Private draft preview" aria-live="polite" className={`edge min-w-0 bg-panel ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
        <span className="caps text-[14px] text-accent-ink">Private draft preview</span>
        <span className="caps text-[14px] text-muted">Not public</span>
      </div>
      <div className="p-5">
        <Cover organizer={organizer} />
        {kicker ? (
          <p className="caps mt-5 text-[14px] text-muted">{kicker}</p>
        ) : (
          <p className="caps mt-5 text-[14px] text-muted">
            <Missing>Category not chosen</Missing>
          </p>
        )}
        <h3 className="heading mt-2 text-[clamp(20px,2.4vw,24px)] leading-[1.15]">
          {present(input.title) ? input.title : <Missing>Add a name</Missing>}
        </h3>
        <p className="mt-3 text-[15px] leading-[1.6]">
          {present(input.description) ? input.description : <Missing>Add the story: what you want to make happen, and why it matters.</Missing>}
        </p>

        <Line heading="Who will experience it">
          {present(input.audience) ? input.audience : <Missing>Not said yet.</Missing>}
        </Line>
        <Line heading="What the funding enables">
          {present(input.purpose) ? input.purpose : <Missing>Not said yet.</Missing>}
        </Line>
        <Line heading="Funding goal">
          {goalCents !== null ? (
            <>
              <span className="heading text-[17px]">{formatMoney(goalCents)}</span>
              <span className="mt-1 block text-[14px] text-muted">
                What the work needs. Not the total of the sponsorship options, and not money raised.
              </span>
            </>
          ) : (
            <Missing>No goal. A fundraiser can leave it out.</Missing>
          )}
        </Line>
        <Line heading="What sponsors can count on">
          {present(input.sponsorPromise) ? input.sponsorPromise : <Missing>Not said yet. The priced options come after the funding.</Missing>}
        </Line>
        {(mode || places.length > 0) && (
          <Line heading="Where">
            <span className="caps flex flex-wrap gap-x-4 gap-y-1 text-[14.5px] leading-[2]">
              {mode && <span className="text-accent-ink">{mode}</span>}
              {places.map((p) => (
                <span key={p}>{p}</span>
              ))}
            </span>
          </Line>
        )}
        {(present(input.fundraisingStartsOn) || present(input.fundraisingEndsOn) || present(input.activityStartsOn) || present(input.activityEndsOn)) && (
          <Line heading="When">
            {(present(input.fundraisingStartsOn) || present(input.fundraisingEndsOn)) && (
              <span className="block">Raising: {rangeOrPart(input.fundraisingStartsOn, input.fundraisingEndsOn)}</span>
            )}
            {(present(input.activityStartsOn) || present(input.activityEndsOn)) && (
              <span className="block">The work: {rangeOrPart(input.activityStartsOn, input.activityEndsOn)}</span>
            )}
          </Line>
        )}
        <p className="mt-6 border-t border-line pt-4 text-[14px] leading-[1.55] text-muted">
          A sponsor sees this page only after it is published. Nothing on it is a promise until the sponsorship options say what each one includes.
        </p>
      </div>
    </aside>
  );
}

/** "Oct 3 to Nov 2", or the one end that was given, so a half-known window is shown as half known. */
function rangeOrPart(startsOn: string, endsOn: string): string {
  if (present(startsOn) && present(endsOn)) return formatDateRange(startsOn, endsOn);
  const day = (on: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${on}T00:00:00Z`));
  return present(startsOn) ? `from ${day(startsOn)}` : `until ${day(endsOn)}`;
}

function Line({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 border-t border-line pt-4">
      <p className="caps mb-1.5 text-[14px] text-muted">{heading}</p>
      <p className="text-[15px] leading-[1.6]">{children}</p>
    </div>
  );
}

/** A part nobody has written, said so. Never an example standing in for it. */
function Missing({ children }: { children: React.ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

/**
 * The image at the top of the page. The organizer's own photograph where there is one, because
 * that is what the public page shows today. Otherwise a drawn placeholder in the page's light,
 * labeled as one, with the room a cover image would take when a fundraiser can carry one.
 */
function Cover({ organizer }: { organizer: PreviewOrganizer }) {
  if (organizer.photoUrl) {
    return (
      <figure className="m-0">
        <div className="relative aspect-[16/9] w-full overflow-hidden bg-ground">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={organizer.photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        </div>
        <figcaption className="mt-2 text-[14px] text-muted">The photograph from the organizer page. It is the image the fundraiser page shows today.</figcaption>
      </figure>
    );
  }
  const initials = initialsFor(organizer.name);
  return (
    <figure className="m-0">
      <div role="img" aria-label="Cover image placeholder" className="relative aspect-[16/9] w-full overflow-hidden bg-ground">
        <svg aria-hidden="true" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
          <defs>
            <radialGradient id="draft-cover-light" cx="0.5" cy="0" r="0.9">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.55" />
              <stop offset="0.55" stopColor="var(--accent)" stopOpacity="0.12" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="320" height="180" fill="url(#draft-cover-light)" />
          <path d="M160 0 L60 180 L260 180 Z" fill="var(--accent)" fillOpacity="0.08" />
          <line x1="0" y1="150" x2="320" y2="150" stroke="var(--line)" strokeWidth="1" />
          <circle cx="160" cy="150" r="3" fill="var(--accent)" />
        </svg>
        {initials && (
          <span aria-hidden="true" className="heading absolute left-4 top-4 flex h-11 w-11 items-center justify-center border border-line bg-ground/70 text-[16px]">
            {initials}
          </span>
        )}
      </div>
      <figcaption className="mt-2 text-[14px] text-muted">
        A placeholder. A fundraiser cannot carry a cover image yet; the organizer page&apos;s photograph appears here once there is one.
      </figcaption>
    </figure>
  );
}
