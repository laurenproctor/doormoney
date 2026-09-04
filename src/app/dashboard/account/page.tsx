import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { NewPasswordForm } from "@/components/PasswordForms";
import { Lines } from "@/components/Brand";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dashboardLinks } from "@/lib/roles";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/dashboard/account");
  const [act, username, profile] = await Promise.all([ownedAct(user.id), usernameFor(supabaseAdmin(), user.id), currentProfile(user.id)]);
  const handle = username ?? act?.slug ?? null;
  const roles = profile?.roles ?? [];

  return (
    <DashboardShell
      current="/dashboard/account"
      links={dashboardLinks({ hasAct: Boolean(act), roles })}
      actName={act?.name}
      eyebrow="The account"
      title="How this account"
      accent="signs in"
      intro={<p>The email address gets in from anywhere. A musician can sign in with the board address instead. The password changes here any time.</p>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHead eyebrow="Who this is">The details on file</CardHead>
          <Lines
            lines={[
              <>Name: <b>{profile?.display_name ?? "not set yet"}</b></>,
              <>Email: <b>{user.email}</b></>,
              <>Username: <b>{handle ?? "none, and none is needed"}</b></>,
              handle ? (
                <>
                  Board:{" "}
                  <Link href={`/board/${handle}`} className="text-accent-ink underline underline-offset-4">
                    {SITE.url.replace(/^https?:\/\//, "")}/board/{handle}
                  </Link>
                </>
              ) : (
                <>The board address is set when the act is listed.</>
              ),
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            {act || roles.includes("musician") ? (
              <>
                A musician&apos;s username and board address are one word, claimed and changed together on{" "}
                <Link href="/dashboard/act" className="text-accent-ink underline underline-offset-4">the act page</Link>.
              </>
            ) : (
              <>A username comes with a board. Backing musicians needs only the email address above.</>
            )}
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
