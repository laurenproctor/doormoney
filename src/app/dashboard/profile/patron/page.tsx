import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardHead, DashboardShell } from "@/components/DashboardShell";
import { ActivityList, ProfileDetailsForm, PublishForm } from "@/components/ProfileForms";
import { PatronProfileView } from "@/components/PatronProfileView";
import { currentProfile, ownedAct, requireUser } from "@/lib/auth";
import { getCategoryLabels } from "@/lib/category-registry";
import { dashboardNav } from "@/lib/dashboardModel";
import { fullName } from "@/lib/names";
import {
  eligibleActivity,
  linkPatronRows,
  ownProfile,
  ownProfileDisplay,
  shownAsPublic,
  signedPhotoUrl,
} from "@/lib/patronprofile";
import { SITE } from "@/lib/site";
import { supabaseServer } from "@/lib/supabase/server";

/*
  The patron page, from the side of the person whose page it is.

  /dashboard/profile is still the account's home, and still holds the three parts: who the account
  holder is, what they create, what they support. This is the one part that needed a room of its
  own, because it is the only part that has a public face: a long form, a list of decisions about
  other people's fundraisers, and a page somebody else will read. On the account home all of that
  sat under the fold of two other sections.

  Three things are kept apart here, and the page says which is which at every point.

    Saved      the row exists and holds what was typed. Saving publishes nothing, ever.
    Published  the row is readable at /patron/<username>. Its own control, its own act.
    Shown      one sponsorship or backing on the page. Each is its own decision and stays off
               until it is put on.

  The preview is the real thing. It is the same component the public page renders
  (src/components/PatronProfileView.tsx), handed the owner's own row, read under the owner's own
  session through `ownProfile`. No public view is touched and nothing is published to make a
  preview work, which is what lets an unpublished profile be seen by the only person entitled to
  see it. The photographs are signed for the owner, the way this account's own images always have
  been on the account home.
*/

export const metadata: Metadata = { title: "Patron profile", robots: { index: false, follow: false } };

export default async function PatronProfileWorkspace() {
  const user = await requireUser("/dashboard/profile/patron");
  const verified = (user.email_confirmed_at ?? user.confirmed_at) && user.email ? user.email.trim().toLowerCase() : null;

  // The paid history under this account's own verified address, tied to the account once and for
  // good. Only rows with no owner are taken (migration 0021); nothing financial is rewritten.
  await linkPatronRows(user.id, verified);

  const [profile, act, own, labels] = await Promise.all([
    currentProfile(user.id),
    ownedAct(user.id),
    ownProfile(user.id),
    getCategoryLabels(),
  ]);
  const [activity, photo, header] = await Promise.all([
    eligibleActivity(user.id, verified),
    signedPhotoUrl(own?.photoPath ?? null),
    signedPhotoUrl(own?.headerPath ?? null),
  ]);

  // The categories a patron may say they support come from the registry: the ones it offers as a
  // preference (migration 0050), which is a separate switch from whether a category can publish.
  const sb = await supabaseServer();
  const { data: registry } = await sb.from("fundraiser_categories").select("key,label").eq("preference_enabled", true).order("key");
  const categories = (registry ?? []) as { key: string; label: string }[];

  const username = profile?.username ?? null;
  const published = own?.published ?? false;
  const publicPath = username ? `/patron/${username}` : null;
  const host = SITE.url.replace(/^https?:\/\//, "");
  // Publishing needs a saved profile and a claimed word, and the server refuses without both. The
  // control is disabled for the same two reasons, so the button never offers what the action denies.
  const ready = Boolean(own && username);
  const shown = activity.filter((a) => a.shown && !a.anonymous).length;
  // The owner's own row in the shape the public page reads one in. Built here, from data already
  // loaded under this account's session, and handed to the same component the public page uses.
  const display = own ? ownProfileDisplay(own, username, labels) : null;

  return (
    <DashboardShell
      current="/dashboard/profile"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={fullName(profile)}
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
          <span className="text-muted">Patron profile</span>
        </>
      }
      title="Your patron"
      accent="profile"
      intro={
        <p>
          This is the page other people read when they look you up. It is private until you publish it, and
          publishing shows nothing you have not put on it.
        </p>
      }
    >
      <div className="grid gap-6">
        <StatusBand published={published} ready={ready} hasProfile={Boolean(own)} publicPath={publicPath} host={host} username={username} />

        {/*
          The form is the page, and the preview sits under it.

          It used to be one or the other behind an "Edit profile" switch, which meant a reader who
          came here to change a line had to ask for the form first. Both are on the page now, in
          the order the work happens: edit at the top, and what a reader will see underneath.
        */}
        <Card>
          <ProfileDetailsForm
            profile={own}
            photo={photo}
            header={header}
            categories={categories}
            publicPath={publicPath}
            published={published}
            heading={
              <h2 className="heading text-[20px] leading-tight text-ink">
                {own ? "Edit your patron profile" : "Create your patron profile"}
              </h2>
            }
            intro={
              own
                ? "Everything here is optional except the name, and all of it appears on the page below. Changes save on their own; saving never publishes the page."
                : "A page needs a name; the rest is optional and can follow later. It stays private until you publish it, and no amount ever appears on it."
            }
          />
        </Card>

        {own && display && (
          <section aria-labelledby="preview-head">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2 id="preview-head" className="caps edge inline-block px-3 py-1.5 text-[14px] text-muted">
                {published ? "Preview" : "Private preview"}
              </h2>
              <p className="max-w-[62ch] text-[15px] leading-[1.6] text-muted">
                {published
                  ? "Your page as anybody with the address reads it."
                  : "Only you can see this. It is how the page will read once you publish it."}
              </p>
            </div>
            <div className="edge overflow-hidden bg-ground" data-theme={display.theme}>
              <PatronProfileView
                profile={display}
                photo={photo}
                header={header}
                activity={shownAsPublic(activity)}
                labels={labels}
                density="panel"
              />
            </div>
          </section>
        )}

        <Card>
          <CardHead level={2} eyebrow="Public support">
            What appears on the page
          </CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            Choose what support activity appears publicly. Each one is its own decision, and no amount is ever
            shown. {own ? `${shown} ${shown === 1 ? "is" : "are"} on the preview above.` : "Anything put on shows here once the page exists."}
          </p>
          <ActivityList items={activity} />
        </Card>
      </div>
    </DashboardShell>
  );
}

/**
 * The state of the page, in a word, with the one control that changes it.
 *
 * Unpublished is the state worth noticing, so it carries the accent edge; published is settled and
 * carries the ordinary one. The word is the state, and the dot beside it is decoration: nothing
 * here is said in color alone.
 */
function StatusBand({
  published,
  ready,
  hasProfile,
  publicPath,
  host,
  username,
}: {
  published: boolean;
  ready: boolean;
  hasProfile: boolean;
  publicPath: string | null;
  host: string;
  username: string | null;
}) {
  return (
    <div
      className={`edge flex flex-wrap items-center gap-x-6 gap-y-4 bg-[color-mix(in_srgb,var(--ink)_5%,var(--ground))] px-5 py-4 ${
        published ? "" : "border-accent-line"
      }`}
    >
      <span className="flex items-center gap-3">
        <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${published ? "bg-accent" : "border border-accent-line"}`} />
        <b className="text-[15px] font-medium">{published ? "Published" : "Unpublished"}</b>
      </span>

      <p className="min-w-0 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
        {published && publicPath ? (
          <>
            Anybody with the address can read it:{" "}
            <Link href={publicPath} className="break-all text-accent-ink underline decoration-1 underline-offset-4">
              {host}
              {publicPath}
            </Link>
          </>
        ) : (
          "Only you can see this profile preview."
        )}
      </p>

      <div className="ml-auto">
        <PublishForm published={published} ready={ready} />
      </div>

      {/* Why the control is off, said next to it rather than left to be guessed at. */}
      {!published && !ready && (
        <p className="basis-full border-t border-line pt-4 text-[14.5px] leading-[1.6] text-muted">
          <Blocked hasProfile={hasProfile} username={username} />
        </p>
      )}
    </div>
  );
}

function Blocked({ hasProfile, username }: { hasProfile: boolean; username: string | null }): ReactNode {
  if (!hasProfile) return <>Save the profile below first. A page needs a name before it can have a reader.</>;
  if (!username)
    return (
      <>
        Claim a username before publishing: it is the address of the page. It is on{" "}
        <Link href="/dashboard/profile#identity" className="text-accent-ink underline decoration-1 underline-offset-4">
          your account profile
        </Link>
        .
      </>
    );
  return null;
}
