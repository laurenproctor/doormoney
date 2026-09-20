import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { NewPasswordForm } from "@/components/PasswordForms";
import { AccountNameForm, AccountPhotoForm } from "@/components/AccountForms";
import { Lines } from "@/components/Brand";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { accountPhotoUrl } from "@/lib/accountPhotoUrl";
import { fullName } from "@/lib/names";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dashboardNav } from "@/lib/dashboardModel";
import { SITE } from "@/lib/site";
import { actPath, bareActUrl } from "@/lib/urls";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/dashboard/account");
  const [act, username, profile, photo] = await Promise.all([
    ownedAct(user.id),
    usernameFor(supabaseAdmin(), user.id),
    currentProfile(user.id),
    accountPhotoUrl(user.id),
  ]);
  const handle = username ?? act?.slug ?? null;
  const roles = profile?.roles ?? [];

  return (
    <DashboardShell
      current="/dashboard/account"
      nav={dashboardNav({ hasAct: Boolean(act), roles })}
      actName={act?.name}
      eyebrow="The account"
      title="How this account"
      accent="signs in"
      intro={<p>The email address gets in from anywhere. A musician can sign in with their address instead. The name, the photo and the password change here any time.</p>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHead eyebrow="Who this is">The details on file</CardHead>
          <Lines
            lines={[
              <>Name: <b>{fullName(profile) ?? "not set yet"}</b></>,
              <>Email: <b>{user.email}</b></>,
              <>Username: <b>{handle ?? "none yet, and none is needed"}</b></>,
              act && handle ? (
                <>
                  Board:{" "}
                  <Link href={actPath(handle)} className="text-accent-ink underline underline-offset-4">
                    {bareActUrl(handle)}
                  </Link>
                </>
              ) : handle ? (
                <>
                  Patron page:{" "}
                  <Link href="/dashboard/profile" className="text-accent-ink underline underline-offset-4">
                    {SITE.url.replace(/^https?:\/\//, "")}/patron/{handle}
                  </Link>
                </>
              ) : (
                <>The username is claimed with a musician page, or with a patron profile.</>
              ),
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            {act || roles.includes("musician") ? (
              <>
                A musician&apos;s username and board address are one word, claimed together on{" "}
                <Link href="/dashboard/act" className="text-accent-ink underline underline-offset-4">the musician page</Link>.
                It can move once every twelve months, and both addresses move with it. The date it next can, and the
                same change for a patron page, are on{" "}
                <Link href="/dashboard/profile" className="text-accent-ink underline underline-offset-4">the profile page</Link>.
              </>
            ) : (
              <>
                Backing musicians needs only the email address above. A username comes with a board, or with an
                optional{" "}
                <Link href="/dashboard/profile" className="text-accent-ink underline underline-offset-4">patron profile</Link>,
                and can move once every twelve months.
              </>
            )}
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Your name">First and last</CardHead>
          <AccountNameForm firstName={profile?.first_name ?? null} lastName={profile?.last_name ?? null} />
          <p className="mt-5 text-[14.5px] text-muted">
            This is the person behind the account. A band&apos;s name lives on the musician page, and a patron profile
            has its own display name.
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Your photo">Still or animated</CardHead>
          <AccountPhotoForm photo={photo} />
          <p className="mt-5 text-[14.5px] text-muted">
            Only you see this photo, here on the account page. A patron profile has its own photo, and that one goes
            public when you publish the profile.
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Password">Set a new one</CardHead>
          <NewPasswordForm done="/dashboard" doneLabel="Back to the dashboard" />
        </Card>
      </div>
    </DashboardShell>
  );
}
