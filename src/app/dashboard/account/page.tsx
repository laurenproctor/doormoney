import type { Metadata } from "next";
import Link from "next/link";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { NewPasswordForm } from "@/components/PasswordForms";
import { NewsletterPreferenceForm } from "@/components/AccountForms";
import { TwoFactorSetup } from "@/components/TwoFactorForms";
import { Lines } from "@/components/Brand";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { fullName } from "@/lib/names";
import { usernameFor } from "@/lib/username";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { dashboardNav } from "@/lib/dashboardModel";
import { newsletterStanding, normalizeEmail } from "@/lib/newsletter";
import { MAX_TOTP_FACTORS, recoveryCodesStanding, verifiedTotpFactors } from "@/lib/mfa";
import { formatDay } from "@/lib/profile";
import { SITE } from "@/lib/site";

/*
  The account, and nothing that is anybody else's business: the address it signs in with, the
  password, what protects it, and what Door Money sends.

  Who the account holder is, what they organize and what they support all moved to
  /dashboard/profile, which is one page for one identity. The name and photo forms went with them.
  Nothing public is edited here, and nothing here is ever published.
*/

export const metadata: Metadata = { title: "Account", robots: { index: false } };

export default async function AccountPage() {
  const user = await requireUser("/dashboard/account");
  const [act, username, profile] = await Promise.all([
    ownedAct(user.id),
    usernameFor(supabaseAdmin(), user.id),
    currentProfile(user.id),
  ]);
  const handle = username ?? act?.slug ?? null;
  const personName = fullName(profile);
  // The address on the verified session decides which row is this account's. Nothing here, and
  // nothing in the actions behind the control, takes an address from the browser.
  const email = normalizeEmail(user.email) ?? normalizeEmail(profile?.email);
  const newsletter = await newsletterStanding({ userId: user.id, email });
  /*
    The factors are on the verified session's own user, so this is Supabase's word rather than
    anything Door Money keeps. The secret behind them is not in this object and never was, and
    neither are the recovery codes: only how many are left.
  */
  const sb = await supabaseServer();
  const totp = verifiedTotpFactors(user);
  const recovery = totp.length > 0 ? await recoveryCodesStanding(sb) : { known: false, total: 0, remaining: 0 };

  return (
    <DashboardShell
      current="/dashboard/account"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={personName}
      eyebrow="The account"
      title="How this account"
      accent="signs in"
      intro={
        <p>
          The email address, the password, and what Door Money sends. Your name, your photo and your public pages
          are on{" "}
          <Link href="/dashboard/profile" className="text-accent-ink underline decoration-1 underline-offset-4">
            your profile
          </Link>
          .
        </p>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHead eyebrow="Email">The address on the account</CardHead>
          <Lines
            lines={[
              <>Email: <b>{user.email}</b></>,
              <>Username: <b>{handle ?? "none yet, and none is needed"}</b></>,
              <>Account holder: <b>{personName ?? "not set yet"}</b></>,
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            The email address gets in from anywhere, and it is where account notices, receipts and payout updates
            go. A username signs in too, once one is claimed. To change either, or to change your name, go to{" "}
            <Link href="/dashboard/profile" className="text-accent-ink underline decoration-1 underline-offset-4">
              your profile
            </Link>
            . To move the email address itself, ask through{" "}
            <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
              contact
            </Link>
            .
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Password">Set a new one</CardHead>
          <NewPasswordForm done="/dashboard" doneLabel="Back to the dashboard" />
        </Card>

        <Card>
          <CardHead eyebrow="Security">What protects this account</CardHead>
          <Lines
            lines={[
              <>A password, or a one-time link by email for anyone who never set one.</>,
              <>A forgotten password is reset from <Link href="/forgot" className="text-accent-ink underline underline-offset-4">the reset page</Link>, which says the same thing whether or not an account exists.</>,
              <>Door Money never stores a card number. Stripe holds every payment detail.</>,
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            Sign out from the bar at the top of any page here. If you think somebody else has been in this account,
            change the password first and then tell{" "}
            <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
              {SITE.name}
            </Link>
            .
          </p>

          <div className="mt-7 border-t border-line pt-6">
            <h3 className="heading mb-4 text-[18px] leading-tight text-ink">Two-factor authentication</h3>
            <TwoFactorSetup
              factors={totp.map((factor) => ({ name: factor.name, addedOn: formatDay(new Date(factor.addedAt)) }))}
              canAddBackup={totp.length > 0 && totp.length < MAX_TOTP_FACTORS}
              recovery={recovery}
            />
            <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
              Door Money never sends codes by text message. If the app is lost, resetting the password does not take
              this step off the account, so{" "}
              <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
                tell {SITE.name}
              </Link>{" "}
              and it will be removed.
            </p>
          </div>
        </Card>

        <Card>
          <CardHead eyebrow="Communications">What Door Money sends</CardHead>
          <Lines
            lines={[
              <>Account notices: confirmations, sign-in links and password resets.</>,
              <>Money: receipts, sponsorship and backing notices, payout updates and the record at the end.</>,
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            Both follow your own money and your own account, so they keep coming while the account is open. The one
            list you choose is below.
          </p>

          <div className="mt-7 border-t border-line pt-6">
            <h3 className="heading mb-4 text-[18px] leading-tight text-ink">Door Money newsletter</h3>
            <NewsletterPreferenceForm
              subscribed={newsletter.subscribed}
              email={email}
              configured={newsletter.configured}
              ownedByAnother={newsletter.ownedByAnother}
            />
            <p className="mt-5 text-[14.5px] text-muted">
              Every send carries its own unsubscribe link, so the email can be stopped from the email itself as
              well as from here.
            </p>
          </div>
        </Card>
      </div>
    </DashboardShell>
  );
}
