import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme, themeFor } from "@/components/Theme";
import { ProjectUpdateLog } from "@/components/ProjectUpdateLog";
import { projectUpdatesPath, type Project, type ProjectUpdate } from "@/lib/project-updates";

export function ProjectArchive({ project, updates }: { project: Project; updates: ProjectUpdate[] }) {
  const items = updates.map((u) => ({ kind: "update" as const, id: u.id, date: u.publishedAt!, displayDate: u.publishedAt,
    project: { slug: project.slug, title: project.title }, title: u.title, excerpt: u.excerpt,
    href: `${projectUpdatesPath(project.act.slug, project.slug)}/${u.id}` }));
  return <Theme name={themeFor(project.act.slug)}>
    <Nav current="/fundraisers" />
    <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-7 py-16">
      <p className="caps text-[14px]">Archived project · Canceled</p>
      <h1 className="display mt-5 text-[clamp(40px,7vw,78px)] leading-[1.05]">{project.title}</h1>
      <p className="mt-6 text-[17px]">By <Link className="underline underline-offset-4" href={`/${project.act.slug}`}>{project.act.name}</Link></p>
      <div className="mt-10 border-l-4 border-current pl-6">
        <h2 className="heading text-[28px]">This fundraiser was canceled</h2>
        <p className="mt-3 max-w-[65ch] text-[16px] leading-[1.6]">{project.cancelledAt
          ? `Door Money recorded the cancellation on ${new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(project.cancelledAt))}.`
          : "Door Money recorded this fundraiser as canceled."} The project remains in the organizer’s public history. This page is read-only; no sponsorships can be purchased here.</p>
        <p className="mt-3 text-[15px]">Individual payment and refund details remain in each sponsor’s private record.</p>
      </div>
      <section className="mt-16"><h2 className="heading text-[34px]">Project Updates</h2>
        {items.length ? <><ProjectUpdateLog items={items} /><Link className="mt-6 inline-block underline underline-offset-4" href={projectUpdatesPath(project.act.slug, project.slug)}>Read the journal →</Link></>
          : <p className="mt-6 text-[16px]">There are no published updates for this project.</p>}
      </section>
    </main><Footer />
  </Theme>;
}
