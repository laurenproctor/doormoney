import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme, themeFor } from "@/components/Theme";
import { ProjectUpdateLog } from "@/components/ProjectUpdateLog";
import { publicProject, publishedUpdates, projectUpdatesPath } from "@/lib/project-updates";
import { runSlugFromSegment } from "@/lib/urls";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";
import { currentUser } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { setProjectFollow } from "@/app/actions/project-follows";

type Props = { params: Promise<{ slug: string; run: string }>; searchParams: Promise<{ page?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, run } = await params;
  const runSlug = runSlugFromSegment(run);
  const project = runSlug ? await publicProject(slug, runSlug) : null;
  return { title: project ? `${project.title} · Project Updates` : "Project Updates",
    robots: { index: Boolean(project) } };
}

export default async function UpdatesPage({ params, searchParams }: Props) {
  const [{ slug, run }, query] = await Promise.all([params, searchParams]);
  const runSlug = runSlugFromSegment(run);
  if (!runSlug) notFound();
  const project = await publicProject(slug, runSlug);
  if (!project) {
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(projectUpdatesPath(moved, runSlug));
    notFound();
  }
  const page = Math.max(1, Math.min(100, Number(query.page) || 1));
  const updates = await publishedUpdates(project.id, page, 10);
  const user = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? await currentUser() : null;
  const { data: following } = user ? await supabaseAdmin().from("project_update_follows")
    .select("run_id").eq("run_id", project.id).eq("profile_id", user.id).maybeSingle() : { data: null };
  const items = updates.map((u) => ({ kind: "update" as const, id: u.id, date: u.publishedAt!, displayDate: u.publishedAt,
    project: { slug: project.slug, title: project.title }, title: u.title, excerpt: u.excerpt,
    href: `${projectUpdatesPath(slug, runSlug)}/${u.id}` }));
  return <Theme name={themeFor(slug)}><Nav current="/fundraisers" /><main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-7 py-16">
    <Link href={`/${slug}/${run}`} className="text-[15px] underline underline-offset-4">← {project.title}</Link>
    <p className="caps mt-12 text-[14px]">{project.status === "cancelled" ? "Canceled project · read-only archive" : "Project journal"}</p>
    <h1 className="display mt-4 text-[clamp(42px,7vw,80px)]">Project Updates</h1>
    <p className="mt-4 text-[17px]">{project.title} by <Link href={`/${slug}`} className="underline underline-offset-4">{project.act.name}</Link></p>
    {project.act.ownerId !== user?.id && <div className="mt-7 rounded border border-line p-5">
      <p className="text-[15px]">Get an email when this project publishes an update. This is separate from new fundraiser emails.</p>
      {user ? <form action={setProjectFollow} className="mt-3"><input type="hidden" name="run" value={project.id} />
        <button name="intent" value={following ? "unfollow" : "follow"} className="text-[15px] underline underline-offset-4">{following ? "Stop update emails" : "Follow project updates"}</button>
      </form> : <Link href={`/login?next=${encodeURIComponent(projectUpdatesPath(slug, runSlug))}`} className="mt-3 inline-block text-[15px] underline underline-offset-4">Sign in to follow updates</Link>}
    </div>}
    {items.length ? <ProjectUpdateLog items={items} /> : <p className="mt-10 text-[16px]">No published updates yet.</p>}
    <nav aria-label="Journal pages" className="mt-8 flex gap-6 text-[16px]">
      {page > 1 && <Link href={`${projectUpdatesPath(slug, runSlug)}?page=${page - 1}`} className="underline underline-offset-4">← Newer</Link>}
      {updates.length === 10 && <Link href={`${projectUpdatesPath(slug, runSlug)}?page=${page + 1}`} className="underline underline-offset-4">Older →</Link>}
    </nav>
  </main><Footer /></Theme>;
}
