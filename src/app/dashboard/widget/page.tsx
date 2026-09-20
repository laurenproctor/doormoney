import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardShell, Card, CardHead } from "@/components/DashboardShell";
import { requireUser, ownedAct, currentProfile } from "@/lib/auth";
import { hasRole } from "@/lib/roles";
import { dashboardNav } from "@/lib/dashboardModel";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import { embedSnippet } from "@/lib/fundraiser-identity";
import { actPath, runPath } from "@/lib/urls";

export const metadata: Metadata = { title: "On your site" };

/*
  The one line a musician pastes into their own site, and the two images for places that only take
  a link.

  This used to sit at the bottom of the overview, which meant it appeared and disappeared with the
  fundraiser under it and was the longest thing on a page meant to be scanned. Decision 14 took the
  widget out of the public nav and left the dashboard as the only way to reach it, so it gets an
  address of its own and the rail points at it.
*/
export default async function DashboardWidgetPage() {
  const user = await requireUser("/dashboard/widget");
  const [act, profile] = await Promise.all([ownedAct(user.id), currentProfile(user.id)]);
  if (!act) {
    const roles = profile?.roles;
    redirect(hasRole(roles, "patron") && !hasRole(roles, "musician") && !hasRole(roles, "organizer") ? "/patron" : "/dashboard/act/new");
  }

  // A widget is for one exact fundraiser, so there is one line per open fundraiser and each names
  // its own. The widget sells music's backing tiers, so only music fundraisers have one. The button
  // links at whichever fundraiser is running; with none it points at the organizer's own page,
  // which is the address that keeps working between fundraisers.
  const sb = await supabaseServer();
  const { data: openRuns } = await sb
    .from("runs")
    .select("id,slug,title,category_key,starts_on")
    .eq("act_id", act.id)
    .in("status", ["open", "live"])
    .order("starts_on", { ascending: false });
  const open = (openRuns ?? []) as { id: string; slug: string; title: string; category_key: string | null }[];
  const live = open[0] ?? null;
  const widgets = open.filter((r) => (r.category_key ?? "music") === "music").map((r) => ({ title: r.title, snippet: embedSnippet(SITE.url, act.slug, r.id) }));

  const target = live ? runPath(act.slug, live.slug) : actPath(act.slug);
  const buttonSrc = `${SITE.url}/badge/button.svg?act=${encodeURIComponent(act.name)}`;
  const buttonSnippet = `<a href="${SITE.url}${target}"><img src="${buttonSrc}" alt="Back ${act.name} on Door Money" height="44"></a>`;

  return (
    <DashboardShell
      current="/dashboard/widget"
      nav={dashboardNav({ hasAct: true, roles: profile?.roles ?? [] })}
      actName={act.name}
      eyebrow={act.city ?? "Organizer"}
      title="On your"
      accent="site"
      intro={<p>The widget is for one fundraiser and takes money for that one only. The button points at your own page, so it keeps working between fundraisers.</p>}
    >
      <div className="grid gap-6">
        <Card>
          <CardHead eyebrow="The widget">One line for your own site</CardHead>
          <p className="mb-4 max-w-[62ch] text-[15px] leading-[1.6] text-muted">
            Paste this where the widget should sit: an embed block, a code block, a footer. It shows the fundraiser, the
            backing tiers and a button, and takes the payment on the page.
          </p>
          {widgets.map((w) => (
            <div key={w.snippet} className="mb-4 last:mb-0">
              {widgets.length > 1 && <p className="caps mb-2 text-[14px] text-accent-ink">{w.title}</p>}
              <pre className="edge max-w-full overflow-x-auto bg-ground p-4 font-mono text-[14.5px] leading-[1.6] text-ink">
                <code>{w.snippet}</code>
              </pre>
            </div>
          ))}
          {widgets.length === 0 ? (
            <p className="max-w-[62ch] text-[14.5px] leading-[1.6] text-muted">
              The line appears here once a music fundraiser is published. Each fundraiser gets its own, so a backing
              always reaches the fundraiser your visitors were reading about.
            </p>
          ) : (
            <p className="mt-4 max-w-[62ch] text-[14.5px] leading-[1.6] text-muted">
              Each line is for that fundraiser only. When it closes, the widget says so and takes no more backings.
              A line you pasted before this page showed a fundraiser in it still works, and follows your current fundraiser.
            </p>
          )}
        </Card>

        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card>
            <CardHead eyebrow="For a link in a bio">The link button</CardHead>
            <p className="mb-4 max-w-[52ch] text-[14.5px] leading-[1.6] text-muted">
              For places that only allow a link: a link-in-bio page, Bandcamp, a newsletter footer, an Instagram bio. It
              sends a patron to the same page, where the same payment happens.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={buttonSrc} alt={`Back ${act.name} on Door Money`} height={44} className="mb-4 block h-11 w-auto max-w-full" />
            <pre className="edge max-w-full overflow-x-auto bg-ground p-4 font-mono text-[14px] leading-[1.6] text-ink">
              <code>{buttonSnippet}</code>
            </pre>
            <p className="mt-3 max-w-none text-[14px] text-muted">
              Or the address alone: <span className="break-all text-ink">{SITE.url}{target}</span>
            </p>
          </Card>

          <Card>
            <CardHead eyebrow="For a footer or a poster">The badge</CardHead>
            <p className="mb-4 max-w-[52ch] text-[14.5px] leading-[1.6] text-muted">
              &quot;Backed on Door Money&quot;, for a website footer, a poster credit or a merch table card. Dark and
              light.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge/dark.svg" alt="Backed on Door Money, dark badge" width={236} height={48} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/badge/light.svg" alt="Backed on Door Money, light badge" width={236} height={48} />
            </div>
            <p className="mt-4 max-w-none text-[14px] text-muted">
              Download:{" "}
              <a href="/badge/dark.svg" download="backed-on-door-money-dark.svg" className="text-accent-ink underline decoration-1 underline-offset-4">
                dark
              </a>
              ,{" "}
              <a href="/badge/light.svg" download="backed-on-door-money-light.svg" className="text-accent-ink underline decoration-1 underline-offset-4">
                light
              </a>
              ,{" "}
              <a
                href={`/badge/button.svg?act=${encodeURIComponent(act.name)}`}
                download="back-on-door-money-button.svg"
                className="text-accent-ink underline decoration-1 underline-offset-4"
              >
                the button
              </a>
              .
            </p>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
