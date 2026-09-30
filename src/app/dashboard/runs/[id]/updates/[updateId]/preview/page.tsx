import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownerUpdatePreview, projectById } from "@/lib/project-updates";
import { ProjectMedia } from "@/components/ProjectMedia";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme, themeFor } from "@/components/Theme";

export const metadata = { title: "Private project update preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function Preview({ params }: { params: Promise<{ id: string; updateId: string }> }) {
  const { id, updateId } = await params;
  const user = await requireUser(`/dashboard/runs/${id}/updates/${updateId}/preview`);
  const project = await projectById(id, user.id);
  if (!project) notFound();
  const update = await ownerUpdatePreview(id, updateId, user.id);
  if (!update) notFound();
  return <Theme name={themeFor(project.act.slug)}><Nav /><main id="main" className="mx-auto w-full max-w-[840px] flex-1 px-7 py-16">
    <p className="rounded border border-current p-4 text-[15px]">Private preview · {update.publishedAt ? "Currently published" : "Draft"}. Only the organizer can open this page.</p>
    <Link href={`/dashboard/runs/${id}?tab=updates&edit=${updateId}`} className="mt-6 inline-block text-[15px] underline underline-offset-4">← Back to editor</Link>
    <p className="caps mt-12 text-[14px]">{project.title} · Project update</p>
    <h1 className="display mt-4 text-[clamp(42px,7vw,72px)] leading-[1.06]">{update.title}</h1>
    <p className="mt-10 text-[20px] leading-[1.6]">{update.excerpt}</p>
    <div className="mt-8 whitespace-pre-wrap text-[17px] leading-[1.8]">{update.body}</div>
    <ProjectMedia media={update.media} />
  </main><Footer /></Theme>;
}
