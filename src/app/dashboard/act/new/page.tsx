import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell } from "@/components/DashboardShell";
import { OrganizerSetup, type ExistingOrganizer } from "@/components/OrganizerSetup";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
import { placeLine } from "@/lib/countries";
import { accountDisplayName, suggestSlug } from "@/lib/organizer-setup";
import { entityKindLabel } from "@/lib/participation";
import { ownProfile } from "@/lib/patronprofile";
import { SITE } from "@/lib/site";
import { starterKit } from "@/lib/starter-kits";

/*
  The first step toward a sponsorship: who is behind it.

  This used to be a whole organizer profile, asked for before anybody had described anything: a
  music subtype, an address that was also the sign-in username, a city, a region, a country code
  typed by hand, social links, a bio, an audience and a photograph. All of it before the question
  a sponsor actually reads, which is what the funding enables and what the sponsorship includes.

  So the page asks one question. Somebody raising money under their own name is asked for nothing,
  because this account already knows their name. An organization is asked for its name, and for
  four lines that are all optional. Everything the long form collected is still collected, on
  /dashboard/act, where the organizer is edited afterwards.

  The music subtype is not here, and no value is dropped: `acts.type` is untouched by this screen,
  every stored value stays, and the field is still on the editing page as music's own. What an
  organizer raises money *for* is a fundraiser's category, chosen on the fundraiser.
*/

export const metadata: Metadata = { title: "New organizer", robots: { index: false, follow: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewActPage({ searchParams }: Props) {
  // A starter kit picked before there was an organizer to hang a fundraiser on. It is looked up in
  // the kit registry, so only a real kit's key travels on, and it is carried, never stored.
  const { template } = await searchParams;
  const kit = typeof template === "string" ? starterKit(template) : null;
  const user = await requireUser(kit ? `/dashboard/act/new?template=${kit.key}` : "/dashboard/act/new");

  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  const own = await ownProfile(user.id);

  const personName = fullName(profile);
  const displayName = accountDisplayName({
    fullName: personName,
    patronDisplayName: own?.displayName ?? null,
    email: profile?.email ?? user.email ?? null,
  });

  // The organizer this account already manages, if it has one. One per account today
  // (acts_one_per_owner, migration 0022), so this is a list of one or of none.
  const existing: ExistingOrganizer | null = act
    ? {
        name: act.name,
        slug: act.slug,
        kindLabel: entityKindLabel(act.entity_kind),
        place: placeLine({ city: act.city, region: act.region, countryCode: act.country_code }),
        photoUrl: act.photo_url,
      }
    : null;

  return (
    <DashboardShell
      current="/dashboard/profile"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={personName}
      eyebrow={
        <>
          <Link
            href="/dashboard/profile"
            className="text-accent-ink underline decoration-1 underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-ink"
          >
            Profile
          </Link>
          <span aria-hidden="true" className="mx-2.5 text-muted">
            /
          </span>
          <span className="text-muted">New organizer</span>
        </>
      }
      title={"Who\u2019s behind"}
      accent="your project?"
      intro={<p>Use your profile or add a business, team, or organization.</p>}
    >
      <OrganizerSetup
        self={{
          name: displayName,
          username: profile?.username ?? null,
          suggestedSlug: displayName ? suggestSlug(displayName) : "",
        }}
        existing={existing}
        host={SITE.url.replace(/^https?:\/\//, "")}
        template={kit?.key ?? null}
      />
    </DashboardShell>
  );
}
