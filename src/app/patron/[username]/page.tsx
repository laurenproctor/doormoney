import type { Metadata } from "next";
import { cache } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { PatronProfileView } from "@/components/PatronProfileView";
import { Theme } from "@/components/Theme";
import { SITE } from "@/lib/site";
import { normalizeUsername } from "@/lib/username";
import {
  currentUsernameFor,
  getPublicActivity,
  getPublicProfile,
  signedPhotoUrl,
  type PublicProfile,
} from "@/lib/patronprofile";
import { getCategoryLabels } from "@/lib/category-registry";

/*
  A patron's public page.

  Everything here was chosen twice: once when the patron published the profile, and once for each
  sponsorship or backing they put on it. A profile nobody published, a username nobody holds, and a
  retired word whose owner never published, all read the same from outside: not found, with the
  same words, the same title and the same 404. There is no page that says "private", because a page
  that says "private" says somebody is there. not-found.tsx beside this file is what they see.

  Nothing on this page came from a private column. The two reads go through the sanitised views in
  migrations 0024 and 0043, which carry no email address, no payment status, no Stripe id and no
  amount.

  A patron may be a person or an organization and may support any category. The page says what
  they chose to say and names each fundraiser's own category; it never assumes music.
*/

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }> };

/**
 * The published profile, or where the visitor should have gone instead.
 *
 * Memoized for the request, so generateMetadata and the page below it ask the database once
 * between them rather than twice each.
 */
const resolve = cache(async (raw: string): Promise<{ profile: PublicProfile } | { moved: string } | null> => {
  const username = normalizeUsername(raw);
  const profile = await getPublicProfile(username);
  if (profile) return { profile };
  // A word this patron used to hold still knows where they went, and a link somebody wrote down a
  // year ago should still land on them. But the redirect only goes where there is a published page
  // to land on. Sent to an unpublished profile it would answer, at the old address, the question
  // the new address refuses: who is behind it. So a word that moved to a profile nobody published
  // reads exactly like a word nobody ever held.
  const now = await currentUsernameFor(username);
  if (!now || now === username) return null;
  const published = await getPublicProfile(now);
  return published ? { moved: now } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const found = await resolve(username);
  // Nothing to say and nobody to name, for a missing username, an unpublished profile and a word
  // that moved to one alike. In practice notFound() throws below and the head is then written by
  // not-found.tsx, whose words these match; this is what the route answers if it ever is not.
  if (!found || "moved" in found) {
    return {
      title: "Profile unavailable",
      description: "This profile isn’t available to view.",
      robots: { index: false, follow: false },
    };
  }
  const p = found.profile;
  const description = p.bio ?? `${p.displayName} supports fundraisers on Door Money.`;
  const image = await signedPhotoUrl(p.photoPath);
  return {
    title: `${p.displayName}, patron`,
    description,
    alternates: { canonical: `${SITE.url}/patron/${p.username}` },
    openGraph: {
      title: `${p.displayName} on Door Money`,
      description,
      type: "profile",
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: "summary", title: `${p.displayName} on Door Money`, description },
  };
}

export default async function PatronProfilePage({ params }: Props) {
  const { username } = await params;
  const found = await resolve(username);
  if (!found) notFound();
  if ("moved" in found) permanentRedirect(`/patron/${found.moved}`);

  const profile = found.profile;
  const [activity, photo, header, labels] = await Promise.all([
    getPublicActivity(profile.username),
    signedPhotoUrl(profile.photoPath),
    signedPhotoUrl(profile.headerPath),
    getCategoryLabels(),
  ]);

  return (
    // The patron's own light, from the design system's themes. Never a typed color (src/lib/profile.ts).
    <Theme name={profile.theme}>
      <Nav />
      <main id="main" className="flex-1">
        {/* The same component the owner's preview draws, so what they were shown is what is here. */}
        <PatronProfileView profile={profile} photo={photo} header={header} activity={activity} labels={labels} />
      </main>
      <Footer />
    </Theme>
  );
}
