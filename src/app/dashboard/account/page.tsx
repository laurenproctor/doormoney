import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { NewPasswordForm } from "@/components/PasswordForms";
import { Lines } from "@/components/Brand";
import { requireUser, ownedAct } from "@/lib/auth";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/dashboard/account");
  const [act, username] = await Promise.all([ownedAct(user.id), usernameFor(supabaseAdmin(), user.id)]);
  const handle = username ?? act?.slug ?? null;

  return (
    <DashboardShell
      current="/dashboard/account"
      actName={act?.name}
      eyebrow="The account"
      title="Username and"
      accent="password"
      intro={<p>The username signs the act in and points at the board. The password can change here any time.</p>}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHead eyebrow="Who this is">How the act signs in</CardHead>
          <Lines
            lines={[
              <>Username: <b>{handle ?? "not set yet"}</b></>,
              <>Email: <b>{user.email}</b></>,
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
            The username and the board address are one word, changed together on{" "}
            <Link href="/dashboard/act" className="text-accent-ink underline underline-offset-4">the act page</Link>.
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
