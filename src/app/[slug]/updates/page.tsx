import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getActProfile } from "@/lib/boards";
import { profileUpdateLog } from "@/lib/project-updates";
import { currentSlugFor } from "@/lib/patronprofile";
import { normalizeUsername } from "@/lib/username";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme, themeFor } from "@/components/Theme";
import { ProjectUpdateLog } from "@/components/ProjectUpdateLog";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getActProfile(slug);
  return { title: profile ? `Project Updates · ${profile.act.name}` : "Project Updates", robots: { index: Boolean(profile) } };
}

export default async function ProfileUpdatesPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const profile = await getActProfile(slug);
  if (!profile) {
    const moved = await currentSlugFor(normalizeUsername(slug));
    if (moved && moved !== slug) permanentRedirect(`/${moved}/updates`);
    notFound();
  }
  const page = Math.max(1, Math.floor(Number(sp.page) || 1));
  const items = profile.actId ? await profileUpdateLog(profile.actId, slug, page, 8) : [];
  return <Theme name={themeFor(slug)}><Nav current="/fundraisers" /><main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-7 py-16">
    <Link href={`/${slug}`} className="text-[15px] underline underline-offset-4">← {profile.act.name}</Link>
    <p className="caps mt-12 text-[14px]">{profile.act.name}</p>
    <h1 className="display mt-4 text-[clamp(42px,7vw,80px)]">Project Updates</h1>
    <p className="mt-5 max-w-[65ch] text-[16px]">Updates from this organizer’s projects and a lasting record of canceled fundraisers.</p>
    {items.length ? <ProjectUpdateLog items={items} /> : <p className="mt-10 text-[16px]">No updates yet.</p>}
    <nav aria-label="Update pages" className="mt-8 flex gap-6 text-[16px]">
      {page > 1 && <Link href={`/${slug}/updates?page=${page - 1}`} className="underline underline-offset-4">← Newer</Link>}
      {items.length === 8 && <Link href={`/${slug}/updates?page=${page + 1}`} className="underline underline-offset-4">Older →</Link>}
    </nav>
  </main><Footer /></Theme>;
}
