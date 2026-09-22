import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Card, CardHead, DashboardShell } from "@/components/DashboardShell";
import { ButtonLink } from "@/components/Button";
import { Eyebrow } from "@/components/Brand";
import { AccountNameForm, AccountPhotoForm } from "@/components/AccountForms";
import { ActivityList, ProfileDetailsForm, PublishForm, UsernameForm } from "@/components/ProfileForms";
import { currentProfile, ownedAct, requireUser, type OwnedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { accountPhotoUrl } from "@/lib/accountPhotoUrl";
import { fullName } from "@/lib/names";
import { dashboardNav } from "@/lib/dashboardModel";
import { getCategoryLabels } from "@/lib/category-registry";
import { instagramUrl, websiteLabel } from "@/lib/links";
import {
  ORGANIZER_STATUS_LABEL,
  ORGANIZER_STATUS_WORDS,
  PATRON_STATUS_LABEL,
  PATRON_STATUS_WORDS,
  entityKindLabel,
  organizerStatus,
  patronStatus,
} from "@/lib/participation";
import { SITE } from "@/lib/site";
import { formatDay, interestsText, nextUsernameChange, usernameChangeAllowed } from "@/lib/profile";
import { eligibleActivity, linkPatronRows, ownProfile, signedPhotoUrl, type OwnProfile } from "@/lib/patronprofile";

/*
  One profile, in three parts.

  There used to be two pages that each called themselves a profile: an organizer profile on
  /dashboard/act and a patron profile here, reached from two different sections of the sidebar. A
  person with both read as two accounts, and a person with neither was asked to pick which kind of
  profile they were before they had done anything.

  So this page is the account's whole identity: who the account holder is, what they organize, and
  what they support. What has deliberately *not* been merged is the data. `acts` is the organizer's
  public record, keyed by owner and carrying the public address; `patron_profiles` is the optional,
  private-by-default patron page. Neither is written from the other, and no name typed in one
  section ever lands in another: each part saves on its own, with its own action. That is the
  boundary decision 11 is built on, and joining the two rows would take a patron's page public by
  way of an organizer's name.

  Nothing about the patron page is on by default. It is private until published, and every
  sponsorship and backing is off until it is put on, one at a time. No amount is read, shown or
  sent to the browser.
*/

export const metadata: Metadata = { title: "Profile", robots: { index: false, follow: false } };

export default async function ProfilePage() {
  const user = await requireUser("/dashboard/profile");
  const verified = (user.email_confirmed_at ?? user.confirmed_at) && user.email ? user.email.trim().toLowerCase() : null;

  // The paid history under this account's own verified address, tied to the account once and for
  // good. Only rows with no owner are taken (migration 0021); nothing financial is rewritten.
  await linkPatronRows(user.id, verified);

  const [profile, act, own, accountPhoto, labels] = await Promise.all([
    currentProfile(user.id),
    ownedAct(user.id),
    ownProfile(user.id),
    accountPhotoUrl(user.id),
    getCategoryLabels(),
  ]);
  const [activity, photo, header, publicFundraisers] = await Promise.all([
    eligibleActivity(user.id, verified),
    signedPhotoUrl(own?.photoPath ?? null),
    signedPhotoUrl(own?.headerPath ?? null),
    countPublicFundraisers(act?.id ?? null),
  ]);

  // The categories a patron may say they support come from the registry: the ones it offers as a
  // preference (migration 0050), which is a separate switch from whether a category can publish.
  const sb = await supabaseServer();
  const { data: registry } = await sb.from("fundraiser_categories").select("key,label").eq("preference_enabled", true).order("key");
  const categories = (registry ?? []) as { key: string; label: string }[];

  const personName = fullName(profile);
  const username = profile?.username ?? null;
  const nextChange = nextUsernameChange(profile?.username_set_at);
  const allowed = usernameChangeAllowed(profile?.username_set_at);
  const published = own?.published ?? false;
  const shown = activity.filter((a) => a.shown).length;

  const creating = organizerStatus({ hasAct: Boolean(act), hasPublicFundraiser: publicFundraisers > 0 });
  const supporting = patronStatus({ hasProfile: Boolean(own), published });
  const host = SITE.url.replace(/^https?:\/\//, "");

  return (
    <DashboardShell
      current="/dashboard/profile"
      nav={dashboardNav({ hasAct: Boolean(act), roles: profile?.roles ?? [] })}
      actName={act?.name}
      identity={personName}
      eyebrow="Your profile"
      title="One profile,"
      accent="three parts."
      intro={
        <p>
          This is one account: who you are, what you create, and what you support. The three parts below save
          separately, so nothing you write in one ever overwrites another.
        </p>
      }
    >
      <div className="grid gap-12">
        {/* ---------------------------------------------------------------- Identity */}
        <Part id="identity" eyebrow="Identity" title="The person or organization behind the account">
          <p className="mb-7 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            Your name and photo here are private. They are how Door Money addresses you, and they never appear on a
            public page: an organizer has its own name below, and a patron page has its own display name.
          </p>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHead level={3} eyebrow="Account name">Your name</CardHead>
              <AccountNameForm firstName={profile?.first_name ?? null} lastName={profile?.last_name ?? null} />
            </Card>

            <Card>
              <CardHead level={3} eyebrow="Account photo">Private to you</CardHead>
              <AccountPhotoForm photo={accountPhoto} />
            </Card>

            <Card className="lg:col-span-2">
              <CardHead level={3} eyebrow="In public">What the world can see from this account</CardHead>
              <Details
                rows={[
                  ["Signed in as", <span key="email">{user.email}</span>],
                  [
                    "Organizer page",
                    act ? (
                      <Link href={`/${act.slug}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                        {host}/{act.slug}
                      </Link>
                    ) : (
                      <Unset key="org">No organizer profile yet, so nothing is public</Unset>
                    ),
                  ],
                  [
                    "Patron page",
                    published && username ? (
                      <Link href={`/patron/${username}`} className="text-accent-ink underline decoration-1 underline-offset-4">
                        {host}/patron/{username}
                      </Link>
                    ) : username ? (
                      <Unset key="soon">
                        {host}/patron/{username}, once it is published
                      </Unset>
                    ) : (
                      <Unset key="none">Not published, and no username claimed yet</Unset>
                    ),
                  ],
                ]}
              />

              <div className="mt-7 max-w-[520px]">
                <Eyebrow className="mb-3">The address</Eyebrow>
                <p className="mb-5 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
                  One word is the address of the patron page{act ? ", the address of the organizer page" : ""} and the
                  username this account signs in with. It can move once every twelve months, and the word it leaves
                  behind keeps pointing here rather than going back into circulation.
                </p>
                <UsernameForm
                  username={username}
                  nextChange={nextChange ? formatDay(nextChange) : null}
                  allowed={allowed}
                  siteUrl={SITE.url}
                  hasAct={Boolean(act)}
                />
              </div>

              <p className="mt-7 border-t border-line pt-5 text-[14.5px] text-muted">
                The password, the email address and what Door Money sends are on{" "}
                <Link href="/dashboard/account" className="text-accent-ink underline decoration-1 underline-offset-4">
                  the account page
                </Link>
                . Nothing there is ever published.
              </p>
            </Card>
          </div>
        </Part>

        {/* ---------------------------------------------------------------- Creating */}
        <Part id="creating" eyebrow="Creating" title="The organizer sponsors see">
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Status>{ORGANIZER_STATUS_LABEL[creating]}</Status>
              {creating === "active" && (
                <span className="text-[14.5px] text-muted">
                  {publicFundraisers} published {publicFundraisers === 1 ? "fundraiser" : "fundraisers"}
                </span>
              )}
            </div>
            <p className="mb-7 max-w-[62ch] text-[15px] leading-[1.6] text-muted">{ORGANIZER_STATUS_WORDS[creating]}</p>

            {act ? (
              <Details rows={organizerRows(act, host)} />
            ) : (
              <p className="max-w-[62ch] border-y border-line py-4 text-[15px] leading-[1.6] text-muted">
                An organizer profile is a name, an address and as much or as little else as you want. It is separate
                from your account name above, so a band, a team or a company keeps its own name.
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <ButtonLink href={act ? "/dashboard/act" : "/dashboard/act/new"}>
                {act ? "Edit the organizer profile" : "Create an organizer profile"}
              </ButtonLink>
              {act ? (
                <Link href="/dashboard/runs/new" className="caps text-[14px] text-accent-ink underline underline-offset-4">
                  Create a fundraiser
                </Link>
              ) : (
                // One button, not two to the same page: a fundraiser hangs off the profile, so
                // making the profile is the whole of the next step.
                <span className="text-[14.5px] text-muted">A fundraiser hangs off this profile, so it comes next.</span>
              )}
            </div>
          </Card>
        </Part>

        {/* ---------------------------------------------------------------- Supporting */}
        <Part id="supporting" eyebrow="Supporting" title="The patron page, if you want one">
          <div className="grid gap-6">
            <Card>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Status>{PATRON_STATUS_LABEL[supporting]}</Status>
                {own && (
                  <span className="text-[14.5px] text-muted">
                    {shown} {shown === 1 ? "thing" : "things"} on the page
                  </span>
                )}
              </div>
              <p className="mb-7 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
                {PATRON_STATUS_WORDS[supporting]} No amount is ever shown on it.
              </p>

              {own ? (
                <Details rows={patronRows(own, labels, interestsText(own.interests))} />
              ) : (
                <p className="max-w-[62ch] border-y border-line py-4 text-[15px] leading-[1.6] text-muted">
                  Nothing is filled in. The form at the foot of this page makes the page, and making it publishes
                  nothing: a new page is private until you say otherwise.
                </p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <PublishForm published={published} ready={Boolean(own && username)} />
                <Link href="#patron-details" className="caps text-[14px] text-accent-ink underline underline-offset-4">
                  {own ? "Edit the patron page" : "Create a patron page"}
                </Link>
              </div>
              {!own && (
                <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">Fill in the details below first. A page needs a name.</p>
              )}
              {own && !username && (
                <p className="mt-4 max-w-[62ch] text-[14.5px] text-muted">Claim a username above. It is the address of the page.</p>
              )}
            </Card>

            <Card>
              <CardHead level={3} eyebrow="Public support">What appears on the page</CardHead>
              <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
                Each one is its own decision. Putting one on the page says nothing about the next, and no amount is
                ever shown, here or there.
              </p>
              <ActivityList items={activity} />
            </Card>

            {/* Last on the page on purpose: the longest form here is the most optional thing on it. */}
            <Card id="patron-details">
              <CardHead level={3} eyebrow="The details">Who this patron is</CardHead>
              <p className="mb-6 max-w-[62ch] text-[15px] text-muted">
                All optional, and saved only when you save this form. None of it touches your account name or your
                organizer profile.
              </p>
              <div className="max-w-[720px]">
                <ProfileDetailsForm profile={own} photo={photo} header={header} categories={categories} />
              </div>
            </Card>
          </div>
        </Part>
      </div>
    </DashboardShell>
  );
}

/* ------------------------------------------------------------------ the parts */

/** One of the three parts, with its own heading so the page reads as a list of three. */
function Part({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-head`}>
      <div className="mb-6 border-b border-line pb-5">
        <Eyebrow className="mb-3">{eyebrow}</Eyebrow>
        <h2 id={`${id}-head`} className="heading text-[clamp(22px,3vw,30px)] leading-tight text-ink">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** A name and value list. Long values wrap; nothing is truncated into a half-truth. */
function Details({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 border-y border-line py-5 sm:grid-cols-[minmax(150px,auto)_1fr]">
      {rows.map(([term, value]) => (
        <Fragment key={term}>
          <dt className="caps text-[14px] text-muted">{term}</dt>
          <dd className="min-w-0 break-words text-[15px] leading-[1.6] text-ink">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function Unset({ children }: { children: ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function Status({ children }: { children: ReactNode }) {
  return <span className="caps border border-accent px-3 py-1.5 text-[14px] text-accent-ink">{children}</span>;
}

/* ------------------------------------------------------------------ the rows */

function organizerRows(act: OwnedAct, host: string): [string, ReactNode][] {
  const place = [act.city, act.region, act.country_code].filter(Boolean).join(", ");
  return [
    ["Organizer name", act.name],
    ["Public address", <span key="a">{`${host}/${act.slug}`}</span>],
    ["Kind of organizer", entityKindLabel(act.entity_kind) ?? <Unset key="k">Not stated</Unset>],
    ["Location", place || <Unset key="l">Not set yet</Unset>],
    ["Bio", act.bio || <Unset key="b">Not set yet</Unset>],
    ["Audience", act.audience_description || <Unset key="au">Not set yet</Unset>],
    [
      "Links",
      act.website || act.instagram ? (
        <span key="links" className="flex flex-wrap gap-x-5 gap-y-1">
          {act.website && (
            <a href={act.website} rel="noreferrer noopener" className="text-accent-ink underline decoration-1 underline-offset-4">
              {websiteLabel(act.website)}
            </a>
          )}
          {act.instagram && (
            <a href={instagramUrl(act.instagram)} rel="noreferrer noopener" className="text-accent-ink underline decoration-1 underline-offset-4">
              @{act.instagram}
            </a>
          )}
        </span>
      ) : (
        <Unset key="links">Not set yet</Unset>
      ),
    ],
    ["Photo", act.photo_url ? "Set" : <Unset key="p">Not set yet</Unset>],
  ];
}

function patronRows(own: OwnProfile, labels: Readonly<Record<string, string>>, interests: string): [string, ReactNode][] {
  const named = own.categoryKeys.map((key) => labels[key] ?? key);
  const supported = [...named, ...(own.customTag ? [own.customTag] : [])].join(", ");
  return [
    ["Display name", own.displayName],
    ["Bio", own.bio || <Unset key="b">Not set yet</Unset>],
    ["Location", own.location || <Unset key="l">Not set yet</Unset>],
    [
      "Links",
      own.website || own.links.length > 0 ? (
        <span key="links" className="flex flex-wrap gap-x-5 gap-y-1">
          {own.website && (
            <a href={own.website} rel="noreferrer noopener" className="text-accent-ink underline decoration-1 underline-offset-4">
              {websiteLabel(own.website)}
            </a>
          )}
          {own.links.map((link) => (
            <a key={link.url} href={link.url} rel="noreferrer noopener" className="text-accent-ink underline decoration-1 underline-offset-4">
              {link.label || websiteLabel(link.url)}
            </a>
          ))}
        </span>
      ) : (
        <Unset key="links">Not set yet</Unset>
      ),
    ],
    ["Categories supported", supported || <Unset key="c">None chosen</Unset>],
    ["Interests", interests || <Unset key="i">None yet</Unset>],
    ["Photo", own.photoPath ? "Set" : <Unset key="p">Not set yet</Unset>],
  ];
}

/* ------------------------------------------------------------------ reads */

/**
 * How many of this organizer's fundraisers have left draft.
 *
 * What makes an organizer page public is a published fundraiser (the "public read acts" policy,
 * migration 0041), so this is the same question the world's side of the site asks. Read under the
 * account's own session, so row level security scopes it to fundraisers this account owns.
 */
async function countPublicFundraisers(actId: string | null): Promise<number> {
  if (!actId) return 0;
  const sb = await supabaseServer();
  const { count } = await sb
    .from("runs")
    .select("id", { count: "exact", head: true })
    .eq("act_id", actId)
    .not("status", "in", "(draft,cancelled)");
  return count ?? 0;
}
