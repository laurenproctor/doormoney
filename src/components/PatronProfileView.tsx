import type { ReactNode } from "react";
import { Eyebrow } from "@/components/Brand";
import { HeroArt } from "@/components/HeroArt";
import { PatronActivityItem } from "@/components/domain";
import { linkText, websiteLabel } from "@/lib/links";
import { activityView, type PatronProfileDisplay, type PublicActivity } from "@/lib/patronprofile";
import { impactTotals, initialsFor, patronKindLabel, profileLink, yearOf } from "@/lib/profile";

/*
  A patron's profile, drawn once and used twice.

  The public page at /patron/[username] renders this, and so does the owner's private preview in
  the workspace. That is the whole point of the file: a preview that is built out of different
  markup is a preview of something else, and the owner finds out what their page really looks like
  only after publishing it.

  What differs between the two is density and nothing else. `page` is the public page as it has
  always been: a full-bleed hero and bands of 84px. `panel` is the same thing at workspace scale,
  inside a frame, with the name a level down because the workspace page already has its own H1.
  No field appears in one and not the other, so the preview cannot flatter or mislead.

  What is not known is not drawn. Every optional field is skipped when it is empty rather than
  filled with a placeholder, and nothing on this page is invented: the totals are counted from the
  activity the patron put here themselves, and no amount is counted at all, because none is read.

  The page ends with the patron. It used to close with a band selling the fundraiser index and the
  explainer, and the footer added its own two ways in underneath, so a page about one person ended
  in two invitations to go somewhere else. Both are gone here: the page's own band is deleted, and
  the public page tells the footer to leave its band out (`ways={false}`). The nav and the footer's
  links are still the way on. Do not add a call to action back to this component: it draws the
  owner's preview too, and whatever goes in here they are shown as part of their own page.
*/

export type PatronProfileViewProps = {
  profile: PatronProfileDisplay;
  /** Already signed, by a caller that was allowed to. This component mints nothing. */
  photo: string | null;
  header: string | null;
  /** What the page shows: on the public side the view's rows, on the owner's side what they ticked. */
  activity: PublicActivity[];
  /** The registry's category names, so a fundraiser's category is named rather than keyed. */
  labels: Readonly<Record<string, string>>;
  /** `panel` is the workspace preview: tighter, framed, and a heading level down. */
  density?: "page" | "panel";
};

export function PatronProfileView({ profile, photo, header, activity, labels, density = "page" }: PatronProfileViewProps) {
  const dense = density === "panel";
  const link = profileLink(profile.website);
  const totals = impactTotals(activity);
  // "Something else" says nothing, so it is not said. Every other kind is the patron's own answer.
  const kind = profile.kind === "other" ? null : patronKindLabel(profile.kind);
  // The workspace page owns its H1 already. Same face, one level down.
  const Name = dense ? "h2" : "h1";

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        {/* A header the patron chose sits under the stage light, in the page's light, as an act's photo does. */}
        <HeroArt theme={profile.theme} src={header} signed={Boolean(header)} />
        <div className={`${dense ? "" : "hero-in"} relative ${dense ? "px-6 pb-8 pt-9" : "mx-auto w-full max-w-[1120px] px-7 pb-[64px] pt-[80px]"}`}>
          <Eyebrow className={dense ? "mb-5" : "mb-8"}>Patron profile</Eyebrow>
          <div className={`grid items-start ${dense ? "gap-6 sm:grid-cols-[104px_1fr] sm:gap-7" : "gap-8 sm:grid-cols-[160px_1fr] sm:gap-10"}`}>
            <Avatar name={profile.displayName} photo={photo} dense={dense} />
            <div className="min-w-0">
              <Name className={`display break-words leading-[0.98] ${dense ? "text-[clamp(26px,4vw,40px)]" : "text-[clamp(36px,6vw,72px)]"}`}>
                {profile.displayName}
              </Name>
              <p className={`caps mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14.5px] text-muted`}>
                {/* No username yet means no address yet, and an address nobody has is not drawn. */}
                {profile.username && <span className="break-all text-accent-ink">@{profile.username}</span>}
                {kind && <span>{kind}</span>}
                {profile.location && <span>{profile.location}</span>}
                <span>Patron since {yearOf(profile.patronSince)}</span>
              </p>
              {profile.bio && <p className={`${dense ? "mt-5 text-[16px]" : "mt-6 text-[17px]"} max-w-[54ch] leading-[1.6]`}>{profile.bio}</p>}
              {(link || profile.links.length > 0) && (
                <p className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
                  {link && (
                    <a
                      href={link}
                      rel="nofollow noopener noreferrer ugc"
                      target="_blank"
                      className="break-all text-accent-ink underline decoration-1 underline-offset-4"
                    >
                      {websiteLabel(link)}
                    </a>
                  )}
                  {profile.links.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      rel="nofollow noopener noreferrer ugc"
                      target="_blank"
                      className="break-all text-accent-ink underline decoration-1 underline-offset-4"
                    >
                      {linkText(l)}
                    </a>
                  ))}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {(profile.categories.length > 0 || profile.customTag) && (
        <Band dense={dense} eyebrow="Categories" heading="What this patron supports">
          <ul className={`${dense ? "mt-5" : "mt-7"} flex flex-wrap gap-2.5`}>
            {profile.categories.map((c) => (
              <li key={c.key} className="edge caps bg-panel px-4 py-2.5 text-[14px] text-ink">
                {c.label}
              </li>
            ))}
            {/* Their own words, beside the registry's. It is a tag and links nowhere: it is not a category. */}
            {profile.customTag && <li className="edge caps bg-panel px-4 py-2.5 text-[14px] text-ink">{profile.customTag}</li>}
          </ul>
        </Band>
      )}

      {profile.interests.length > 0 && (
        <Band dense={dense} eyebrow="Interests" heading="In their own words">
          <ul className={`${dense ? "mt-5" : "mt-7"} flex flex-wrap gap-2.5`}>
            {profile.interests.map((i) => (
              <li key={i} className="edge caps bg-panel px-4 py-2.5 text-[14px] text-ink">
                {i}
              </li>
            ))}
          </ul>
        </Band>
      )}

      <Band dense={dense} eyebrow="Public support" heading="What this patron has backed">
        {activity.length === 0 ? (
          <p className="max-w-[56ch] text-[15px] text-muted">
            {profile.displayName} has not put anything on this page yet. What a patron shows here is their own
            choice, one sponsorship or backing at a time.
          </p>
        ) : (
          <>
            <ul className={`caps ${dense ? "mb-6" : "mb-9"} flex flex-wrap gap-x-8 gap-y-2 text-[14.5px] text-accent-ink`}>
              {totals.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <ul className="divide-y divide-line border-y border-line">
              {activity.map((a, i) => (
                <PatronActivityItem key={`${a.kind}-${a.actSlug}-${a.runTitle}-${i}`} item={activityView(a, labels)} />
              ))}
            </ul>
          </>
        )}
      </Band>
    </>
  );
}

/**
 * One band of the profile. The public page's is `Section` exactly as it always was, rule and all;
 * the workspace's is the same band at panel scale, without the scroll reveal, because a block
 * that is revealed on scroll inside a panel somebody just opened reads as a block that failed.
 */
function Band({ dense, eyebrow, heading, children }: { dense: boolean; eyebrow: string; heading: string; children: ReactNode }) {
  return (
    <section className={`border-t border-line ${dense ? "py-8" : "py-[84px]"}`}>
      <div {...(dense ? {} : { "data-reveal": "" })} className={dense ? "px-6" : "mx-auto max-w-[1120px] px-7"}>
        <Eyebrow className="mb-5">{eyebrow}</Eyebrow>
        <h2 className={`heading mb-4 max-w-[22ch] leading-[1.02] ${dense ? "text-[clamp(20px,2.6vw,26px)]" : "text-[clamp(30px,4.4vw,52px)]"}`}>
          {heading}
        </h2>
        {children}
      </div>
    </section>
  );
}

/** The photograph, or the patron's initials in the page's light. Same square either way. */
function Avatar({ name, photo, dense }: { name: string; photo: string | null; dense: boolean }) {
  const box = dense ? "h-[96px] w-[96px] max-sm:h-[76px] max-sm:w-[76px]" : "h-[140px] w-[140px] max-sm:h-[104px] max-sm:w-[104px]";
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        width={dense ? 96 : 140}
        height={dense ? 96 : 140}
        className={`lit ${box} flex-none rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className={`lit heading ${box} flex flex-none items-center justify-center rounded-full border border-accent/70 leading-none text-accent-ink ${
        dense ? "text-[30px] max-sm:text-[24px]" : "text-[42px] max-sm:text-[32px]"
      }`}
    >
      {initialsFor(name)}
    </div>
  );
}
