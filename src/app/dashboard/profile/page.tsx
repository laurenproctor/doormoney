import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardHead, DashboardShell } from "@/components/DashboardShell";
import { ActivityList, ProfileDetailsForm, PublishForm, UsernameForm } from "@/components/ProfileForms";
import { currentProfile, ownedAct, requireUser } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { dashboardLinks } from "@/lib/roles";
import { SITE } from "@/lib/site";
import { formatDay, nextUsernameChange, usernameChangeAllowed } from "@/lib/profile";
import { eligibleActivity, linkPatronRows, ownProfile, signedPhotoUrl } from "@/lib/patronprofile";

/*
  Where a patron decides what the world sees.

  This page is for any account, whether or not it owns an act: a patron who has never listed a band
  reaches it without being sent through musician onboarding, and a musician who also backs the band
  down the street reaches the same page.

  Nothing here is on by default. The profile is private until published, and every placement and
  backing is off until it is put on, one at a time. No amount is read, shown or sent to the browser.
*/

export const metadata: Metadata = { title: "Patron profile", robots: { index: false, follow: false } };

export default async function ProfileSettingsPage() {
  const user = await requireUser("/dashboard/profile");
  const verified = (user.email_confirmed_at ?? user.confirmed_at) && user.email ? user.email.trim().toLowerCase() : null;

  // The paid history under this account's own verified address, tied to the account once and for
  // good. Only rows with no owner are taken (migration 0021); nothing financial is rewritten.
  await linkPatronRows(user.id, verified);

  const [profile, act, own] = await Promise.all([currentProfile(user.id), ownedAct(user.id), ownProfile(user.id)]);
  const [activity, photo] = await Promise.all([eligibleActivity(user.id, verified), signedPhotoUrl(own?.photoPath ?? null)]);

  const username = profile?.username ?? null;
  const nextChange = nextUsernameChange(profile?.username_set_at);
  const allowed = usernameChangeAllowed(profile?.username_set_at);
  const published = own?.published ?? false;
  const publicUrl = username ? `${SITE.url}/patron/${username}` : null;
  const shown = activity.filter((a) => a.shown).length;

  return (
    <DashboardShell
      current="/dashboard/profile"
      links={dashboardLinks({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name ?? fullName(profile)}
      eyebrow="The public profile"
      title="What the room"
      accent="sees"
      intro={
        <p>
          A patron page is optional and starts private. Nothing on it is public until it is published, and no
          placement or backing appears until it is put there one at a time. Amounts never appear at all.
        </p>
      }
    >
      <div className="grid gap-[30px]">
        <Card>
          <CardHead eyebrow="Status">{published ? "The profile is public" : "The profile is private"}</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
            {published ? (
              <>
                Anyone with the address can read the name, the words and the {shown} {shown === 1 ? "thing" : "things"} put
                on the page. Hiding it takes the whole page down, photograph included.
              </>
            ) : (
              <>
                Nobody can reach this page. The address answers as though no such patron exists, which is what it
                should say about somebody who has not asked to be seen.
              </>
            )}
          </p>
          {publicUrl && (
            <p className="mb-6 text-[15px]">
              {published ? (
                <Link href={`/patron/${username}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                  {publicUrl.replace(/^https?:\/\//, "")}
                </Link>
              ) : (
                <span className="text-muted">{publicUrl.replace(/^https?:\/\//, "")}, once it is published.</span>
              )}
            </p>
          )}
          <PublishForm published={published} ready={Boolean(own && username)} />
          {!own && (
            <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">Fill in the details below first. A page needs a name.</p>
          )}
          {own && !username && (
            <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">Claim a username below. It is the address of the page.</p>
          )}
        </Card>

        <Card>
          <CardHead eyebrow="The details">Who this patron is</CardHead>
          <div className="max-w-[720px]">
            <ProfileDetailsForm profile={own} photo={photo} />
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="Public support">What appears on the page</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
            Each one is its own decision. Putting a placement on the page says nothing about the next one, and no
            amount is ever shown, here or there.
          </p>
          <ActivityList items={activity} />
        </Card>

        <Card>
          <CardHead eyebrow="The address">The username</CardHead>
          <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
            The username is the address of the public page{act ? " and the address of the board" : ""}. It can move
            once every twelve months, and the word it leaves behind keeps pointing here rather than going back into
            circulation.
          </p>
          <div className="max-w-[520px]">
            <UsernameForm
              username={username}
              nextChange={nextChange ? formatDay(nextChange) : null}
              allowed={allowed}
              siteUrl={SITE.url}
              hasAct={Boolean(act)}
            />
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="The account">Passwords and private details</CardHead>
          <p className="max-w-[62ch] text-[15px] text-muted">
            The email address, the password and the way this account signs in are kept apart from the public page,
            on{" "}
            <Link href="/dashboard/account" className="text-accent-ink underline decoration-1 underline-offset-4">
              the account page
            </Link>
            . Nothing there is ever published.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
