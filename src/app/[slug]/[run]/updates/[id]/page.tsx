import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme, themeFor } from "@/components/Theme";
import { ProjectMedia } from "@/components/ProjectMedia";
import { publicProject, publishedUpdate, projectUpdatesPath, projectUpdatePath } from "@/lib/project-updates";
import { runSlugFromSegment } from "@/lib/urls";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";

type Props = { params: Promise<{ slug: string; run: string; id: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, run, id } = await params;
  const runSlug = runSlugFromSegment(run);
  const project = runSlug ? await publicProject(slug, runSlug) : null;
  const update = project ? await publishedUpdate(project, id) : null;
  return { title: update ? `${update.title} · ${project!.title}` : "Project update", description: update?.excerpt,
    robots: { index: Boolean(update) } };
}

export default async function UpdatePage({ params }: Props) {
  const { slug, run, id } = await params;
  const runSlug = runSlugFromSegment(run);
  if (!runSlug) notFound();
  const project = await publicProject(slug, runSlug);
  if (!project) {
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(projectUpdatePath(moved, runSlug, id));
    notFound();
  }
  const update = await publishedUpdate(project, id);
  if (!update) notFound();
  return <Theme name={themeFor(slug)}><Nav current="/fundraisers" /><main id="main" className="mx-auto w-full max-w-[840px] flex-1 px-7 py-16">
    <Link href={projectUpdatesPath(slug, runSlug)} className="text-[15px] underline underline-offset-4">← All project updates</Link>
    <p className="caps mt-12 text-[14px]">{project.title} · {project.status === "cancelled" ? "Canceled archive" : "Project update"}</p>
    <h1 className="display mt-4 text-[clamp(42px,7vw,72px)] leading-[1.06]">{update.title}</h1>
    <p className="mt-6 text-[15px] text-muted">Published {new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(update.publishedAt!))}
      {update.editedAt && ` · Edited ${new Intl.DateTimeFormat("en", { dateStyle: "long", timeZone: "UTC" }).format(new Date(update.editedAt))}`}</p>
    <p className="mt-10 text-[20px] leading-[1.6]">{update.excerpt}</p>
    <div className="mt-8 whitespace-pre-wrap text-[17px] leading-[1.8]">{update.body}</div>
    <ProjectMedia media={update.media} />
    {update.recognition.length > 0 && <section className="mt-12 border-t border-line pt-8"><h2 className="heading text-[26px]">With thanks to</h2>
      <ul className="mt-4 flex flex-wrap gap-6">{update.recognition.map((r) => <li key={r.name} className="text-[16px]">{r.logoUrl && <>
        {/* The approved mark URL uses the existing public marks bucket. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.logoUrl} alt="" className="mb-2 h-12 max-w-36 object-contain" />
      </>}{r.name}</li>)}</ul>
    </section>}
    <p className="mt-12 text-[15px] text-muted">Written by <Link href={`/${slug}`} className="underline underline-offset-4">{project.act.name}</Link>. Updates are the organizer’s account of the work; formal sponsorship terms and delivery records remain separate.</p>
  </main><Footer /></Theme>;
}
