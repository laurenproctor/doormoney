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
import { loadFundraiserJumps } from "@/lib/dashboard-home";
import { newsletterStanding, normalizeEmail } from "@/lib/newsletter";
import { MAX_TOTP_FACTORS, recoveryCodesStanding, verifiedTotpFactors } from "@/lib/mfa";
import { formatDay } from "@/lib/profile";
import { SITE } from "@/lib/site";

/*
  Account settings: the address it signs in with, the password, what protects it, and what gets
  sent.

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
  const jumps = await loadFundraiserJumps(act?.id ?? null);

  return (
    <DashboardShell
      current="/dashboard/account"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={personName}
      eyebrow="Your account"
      title="Account"
      accent="settings"
      search={jumps}
      intro={
        <p>
          Your name, photo and public pages are on{" "}
          <Link href="/dashboard/profile" className="text-accent-ink underline decoration-1 underline-offset-4">
            your profile
          </Link>
          .
        </p>
      }
    >
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHead eyebrow="Sign in">Email and username</CardHead>
          <Lines
            lines={[
              <>Email: <b>{user.email}</b></>,
              <>Username: <b>{handle ?? "none yet, and none is needed"}</b></>,
              <>Account holder: <b>{personName ?? "not set yet"}</b></>,
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            Account notices, receipts and payout updates go to this address. A username signs in too, once one is
            claimed. Change your username or your name on{" "}
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
          <CardHead eyebrow="Security">Password</CardHead>
          <NewPasswordForm done="/dashboard" doneLabel="Back to the dashboard" />
          <Lines
            className="mt-7"
            lines={[
              <>A forgotten password is reset from <Link href="/forgot" className="text-accent-ink underline underline-offset-4">the reset page</Link>, which says the same thing whether or not an account exists.</>,
              <>Door Money never stores a card number. Stripe holds every payment detail.</>,
            ]}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            If you think somebody else has been in this account, change the password first, then tell{" "}
            <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
              {SITE.name}
            </Link>
            .
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Security">Two-factor authentication</CardHead>
          <TwoFactorSetup
            factors={totp.map((factor) => ({ name: factor.name, addedOn: formatDay(new Date(factor.addedAt)) }))}
            canAddBackup={totp.length > 0 && totp.length < MAX_TOTP_FACTORS}
            recovery={recovery}
          />
          <p className="mt-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
            Codes never arrive by text message. If the app is lost, resetting the password does not take this step
            off the account, so{" "}
            <Link href="/contact" className="text-accent-ink underline decoration-1 underline-offset-4">
              tell {SITE.name}
            </Link>{" "}
            and it will be removed.
          </p>
        </Card>

        <Card>
          <CardHead eyebrow="Email">Email preferences</CardHead>
          <Lines
            lines={[
              <>Account notices: confirmations, sign-in links and password resets.</>,
              <>Money: receipts, sponsorship and backing notices, payout updates and the record.</>,
            ]}
          />
          <p className="mb-6 mt-5 max-w-[46ch] text-[14.5px] leading-[1.6] text-muted">
            Both keep coming while the account is open. The one list you choose is the newsletter.
          </p>
          <NewsletterPreferenceForm
            subscribed={newsletter.subscribed}
            email={email}
            configured={newsletter.configured}
            ownedByAnother={newsletter.ownedByAnother}
          />
          <p className="mt-5 text-[14.5px] text-muted">
            Every send carries its own unsubscribe link, so it can be stopped from the email itself as well.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
