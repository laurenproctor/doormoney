import { supabaseAdmin } from "@/lib/supabase/server";
import { runPath } from "@/lib/urls";
import { SAMPLE_BOARDS } from "@/lib/sample";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const visible = ["open", "live", "closed", "cancelled"];

export type Project = {
  id: string; slug: string; title: string; status: string; cancelledAt: string | null;
  act: { id: string; slug: string; name: string; ownerId: string | null };
};
export type UpdateMedia = {
  id: string; kind: "image" | "video" | "embed"; url: string | null;
  provider: string | null; videoId: string | null; alt: string | null; caption: string | null;
};
export type ProjectUpdate = {
  id: string; runId: string; title: string; excerpt: string; body: string;
  publishedAt: string | null; editedAt: string | null; media: UpdateMedia[];
  recognition: { name: string; logoUrl: string | null }[];
};

export const projectUpdatesPath = (slug: string, runSlug: string) => `${runPath(slug, runSlug)}/updates`;
export const projectUpdatePath = (slug: string, runSlug: string, id: string) => `${projectUpdatesPath(slug, runSlug)}/${id}`;

/** Public lookup deliberately does not use the live fundraiser renderer or its purchase controls. */
export async function publicProject(slug: string, runSlug: string): Promise<Project | null> {
  if (!configured()) {
    const sample = SAMPLE_BOARDS[slug];
    return sample?.run?.slug === runSlug ? { id: sample.run.id ?? "", slug: runSlug,
      title: sample.run.title, status: sample.run.status ?? "open", cancelledAt: null,
      act: { id: "", slug, name: sample.act.name, ownerId: null } } : null;
  }
  const sb = supabaseAdmin();
  const { data: act } = await sb.from("acts").select("id,slug,name,owner_id").eq("slug", slug).maybeSingle();
  if (!act) return null;
  const { data: run } = await sb.from("runs").select("id,slug,title,status,cancelled_at")
    .eq("act_id", act.id).eq("slug", runSlug).in("status", visible).maybeSingle();
  return run ? {
    id: run.id, slug: run.slug, title: run.title, status: run.status, cancelledAt: run.cancelled_at,
    act: { id: act.id, slug: act.slug, name: act.name, ownerId: act.owner_id },
  } : null;
}

export async function projectById(id: string, ownerId: string): Promise<Project | null> {
  if (!configured() || !UUID.test(id)) return null;
  const { data } = await supabaseAdmin().from("runs")
    .select("id,slug,title,status,cancelled_at,acts!inner(id,slug,name,owner_id)")
    .eq("id", id).eq("acts.owner_id", ownerId).maybeSingle();
  if (!data) return null;
  const act = data.acts as unknown as { id: string; slug: string; name: string; owner_id: string };
  return { id: data.id, slug: data.slug, title: data.title, status: data.status,
    cancelledAt: data.cancelled_at, act: { id: act.id, slug: act.slug, name: act.name, ownerId: act.owner_id } };
}

type RawUpdate = { id: string; run_id: string; title: string; excerpt: string; body: string;
  published_at: string | null; edited_at: string | null };

async function shapeUpdates(rows: RawUpdate[], allowDraftMedia = false): Promise<ProjectUpdate[]> {
  if (!rows.length) return [];
  const sb = supabaseAdmin();
  const [{ data: media }, { data: recognition }] = await Promise.all([
    sb.from("project_update_media").select("id,update_id,kind,object_path,provider,video_id,alt_text,caption,position,uploaded_at")
      .in("update_id", rows.map((r) => r.id)).order("position"),
    sb.from("project_update_recognition").select("update_id,display_name,logo_url")
      .in("update_id", rows.map((r) => r.id)).not("approved_at", "is", null).is("withdrawn_at", null),
  ]);
  return Promise.all(rows.map(async (r) => ({
    id: r.id, runId: r.run_id, title: r.title, excerpt: r.excerpt, body: r.body,
    publishedAt: r.published_at, editedAt: r.edited_at,
    recognition: (recognition ?? []).filter((m) => m.update_id === r.id).map((m) => ({ name: m.display_name, logoUrl: m.logo_url })),
    media: await Promise.all((media ?? []).filter((m) => m.update_id === r.id).map(async (m) => {
      const url = m.object_path && m.uploaded_at && (r.published_at || allowDraftMedia)
        ? (await sb.storage.from("project-updates").createSignedUrl(m.object_path, 600)).data?.signedUrl ?? null : null;
      return { id: m.id, kind: m.kind as UpdateMedia["kind"], url,
        provider: m.provider, videoId: m.video_id, alt: m.alt_text, caption: m.caption };
    })),
  })));
}

export async function publishedUpdates(runId: string, page = 1, pageSize = 10): Promise<ProjectUpdate[]> {
  if (!configured() || !UUID.test(runId)) return [];
  const safePage = Math.max(1, Math.min(100, Math.floor(page) || 1));
  const { data } = await supabaseAdmin().from("project_updates")
    .select("id,run_id,title,excerpt,body,published_at,edited_at")
    .eq("run_id", runId).not("published_at", "is", null)
    .order("published_at", { ascending: false }).order("id", { ascending: false })
    .range((safePage - 1) * pageSize, safePage * pageSize - 1);
  return shapeUpdates((data ?? []) as RawUpdate[]);
}

export async function publishedUpdate(project: Project, id: string): Promise<ProjectUpdate | null> {
  if (!configured() || !UUID.test(id)) return null;
  const { data } = await supabaseAdmin().from("project_updates")
    .select("id,run_id,title,excerpt,body,published_at,edited_at")
    .eq("id", id).eq("run_id", project.id).not("published_at", "is", null).maybeSingle();
  return data ? (await shapeUpdates([data as RawUpdate]))[0] : null;
}

export async function ownerUpdatePreview(runId: string, id: string, ownerId: string): Promise<ProjectUpdate | null> {
  if (!UUID.test(id) || !await projectById(runId, ownerId)) return null;
  const { data } = await supabaseAdmin().from("project_updates")
    .select("id,run_id,title,excerpt,body,published_at,edited_at")
    .eq("id", id).eq("run_id", runId).maybeSingle();
  return data ? (await shapeUpdates([data as RawUpdate], true))[0] : null;
}

export type LogItem = { kind: "update" | "cancellation"; id: string; date: string; displayDate: string | null;
  project: { slug: string; title: string }; title: string; excerpt: string; href: string };

export async function profileUpdateLog(actId: string, actSlug: string, page = 1, pageSize = 8): Promise<LogItem[]> {
  if (!configured() || !UUID.test(actId)) return [];
  const safePage = Math.max(1, Math.floor(page) || 1);
  const { data } = await supabaseAdmin().from("project_update_log")
    .select("id,kind,run_slug,run_title,title,excerpt,occurred_at,display_at")
    .eq("act_id", actId).order("occurred_at", { ascending: false }).order("id", { ascending: false })
    .range((safePage - 1) * pageSize, safePage * pageSize - 1);
  return (data ?? []).map((item) => ({ kind: item.kind as LogItem["kind"], id: item.id,
    date: item.occurred_at, displayDate: item.display_at,
    project: { slug: item.run_slug, title: item.run_title },
    title: item.kind === "cancellation" ? `${item.run_title} was canceled` : item.title,
    excerpt: item.excerpt,
    href: item.kind === "cancellation" ? runPath(actSlug, item.run_slug)
      : projectUpdatePath(actSlug, item.run_slug, item.id),
  }));
}

/** Discovery uses only the same public-status boundary as the actual routes. */
export async function projectUpdateSitemapPaths(): Promise<string[]> {
  if (!configured()) return [];
  const sb = supabaseAdmin();
  const { data: runs } = await sb.from("runs")
    .select("id,slug,status,acts!inner(slug)").in("status", visible).limit(1000);
  if (!runs?.length) return [];
  const projects = new Map(runs.map((r) => [r.id, { slug: r.slug, actSlug: (r.acts as unknown as { slug: string }).slug }]));
  const { data: entries } = await sb.from("project_updates").select("id,run_id")
    .in("run_id", runs.map((r) => r.id)).not("published_at", "is", null).limit(1000);
  const paths = new Set<string>();
  for (const r of runs) if (r.status === "cancelled") paths.add(runPath(projects.get(r.id)!.actSlug, r.slug));
  for (const u of entries ?? []) {
    const project = projects.get(u.run_id);
    if (!project) continue;
    paths.add(`/${project.actSlug}/updates`);
    paths.add(projectUpdatesPath(project.actSlug, project.slug));
    paths.add(projectUpdatePath(project.actSlug, project.slug, u.id));
  }
  return [...paths];
}
