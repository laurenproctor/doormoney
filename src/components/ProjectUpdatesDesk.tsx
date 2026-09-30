import Link from "next/link";
import { addVideoEmbed, removeProjectMedia, saveProjectUpdate, setProjectUpdatePublished } from "@/app/actions/project-updates";
import { ProjectMediaUpload } from "@/components/ProjectMediaUpload";
import { requestProjectRecognition } from "@/app/actions/project-recognition";
import { projectUpdatePath, projectUpdatesPath, UUID } from "@/lib/project-updates";
import { supabaseAdmin } from "@/lib/supabase/server";

const input = "mt-2 block w-full rounded border border-line bg-transparent p-3 text-[16px]";
const button = "rounded border border-current px-5 py-3 text-[15px] hover:opacity-70";

export async function ProjectUpdatesDesk({ runId, slug, runSlug, editId, error, mediaAllowed = true }: {
  runId: string; slug: string; runSlug: string; editId?: string; error?: string; mediaAllowed?: boolean;
}) {
  const sb = supabaseAdmin();
  const { data: entries } = await sb.from("project_updates")
    .select("id,title,excerpt,body,published_at,edited_at,created_at")
    .eq("run_id", runId).order("created_at", { ascending: false });
  const selected = UUID.test(editId ?? "") ? entries?.find((e) => e.id === editId) : null;
  const { data: media } = selected ? await sb.from("project_update_media")
    .select("id,kind,object_path,provider,video_id,alt_text,caption,uploaded_at")
    .eq("update_id", selected.id).order("position") : { data: [] };
  const { data: purchases } = selected ? await sb.from("purchases")
    .select("id,patrons!inner(name,profile_id),lots!inner(run_id,label)")
    .eq("lots.run_id", runId).in("payment_status", ["held", "released", "partially_refunded"]).limit(50) : { data: [] };
  const { data: recognition } = selected ? await sb.from("project_update_recognition")
    .select("id,purchase_id,display_name,approved_at,withdrawn_at")
    .eq("update_id", selected.id) : { data: [] };
  const href = `/dashboard/runs/${runId}?tab=updates`;
  return <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
    <section className="rounded border border-line p-6">
      <h2 className="heading text-[28px]">Project Updates</h2>
      <p className="mt-3 text-[15px] leading-[1.6] text-muted">Share progress from this fundraiser. Updates are the organizer’s account, separate from purchased promises and delivery evidence.</p>
      <Link href={projectUpdatesPath(slug, runSlug)} className="mt-5 inline-block text-[15px] underline underline-offset-4">See public journal →</Link>
      <ol className="mt-7 divide-y divide-line border-t border-line">
        {(entries ?? []).map((e) => <li key={e.id} className="py-5">
          <p className="text-[14px] text-muted">{e.published_at ? `Published ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(e.published_at))}` : "Private draft"}</p>
          <Link className="mt-2 block text-[18px] underline underline-offset-4" href={`${href}&edit=${e.id}`}>{e.title}</Link>
          {e.published_at && <Link href={projectUpdatePath(slug, runSlug, e.id)} className="mt-2 inline-block text-[14px] underline underline-offset-4">View update ↗</Link>}
        </li>)}
      </ol>
      {!entries?.length && <p className="mt-6 text-[15px]">No updates yet.</p>}
    </section>
    <section className="rounded border border-line p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="heading text-[28px]">{selected ? "Edit update" : "Write an update"}</h2>
        {selected && <Link href={href} className="text-[15px] underline underline-offset-4">New update</Link>}
      </div>
      {error && <p role="alert" className="mt-4 text-[14px]">{error === "content" ? "Add a title, preview and body within the limits shown." : "Could not save that change. Check the link or attachment and try again."}</p>}
      <form action={saveProjectUpdate} className="mt-6 grid gap-5">
        <input type="hidden" name="run" value={runId} />
        {selected && <input type="hidden" name="id" value={selected.id} />}
        <label className="text-[15px]">Title<input name="title" required maxLength={160} defaultValue={selected?.title ?? ""} className={input} /></label>
        <label className="text-[15px]">Preview (up to 360 characters)<textarea name="excerpt" required maxLength={360} rows={3} defaultValue={selected?.excerpt ?? ""} className={input} /></label>
        <label className="text-[15px]">Update<textarea name="body" required maxLength={20000} rows={12} defaultValue={selected?.body ?? ""} className={input} /></label>
        <div className="flex flex-wrap gap-3">
          {!selected?.published_at && <button name="intent" value="draft" className={button}>Save private draft</button>}
          <button name="intent" value="publish" className={button}>{selected?.published_at ? "Save published update" : "Publish update"}</button>
        </div>
      </form>
      {selected && <>
        <Link href={`/dashboard/runs/${runId}/updates/${selected.id}/preview`} className="mt-4 inline-block text-[15px] underline underline-offset-4">Preview privately →</Link>
        {selected.published_at && <form action={setProjectUpdatePublished} className="mt-4"><input type="hidden" name="id" value={selected.id} /><button name="intent" value="unpublish" className="text-[15px] underline underline-offset-4">Unpublish this update</button></form>}
        <div className="mt-10 border-t border-line pt-7">
          <h3 className="heading text-[23px]">Images and video</h3>
          <p className="mt-3 text-[14px] text-muted">Add media after saving the text. Published attachments appear in the journal. Unpublishing stops new media links; an already issued link can last up to ten minutes.</p>
          {mediaAllowed ? <ProjectMediaUpload updateId={selected.id} /> : <p className="mt-4 text-[15px]">Public media is unavailable for youth projects.</p>}
          {mediaAllowed && <form action={addVideoEmbed} className="mt-7 grid gap-3 border-t border-line pt-6">
            <input type="hidden" name="id" value={selected.id} />
            <label className="text-[15px]">YouTube or Vimeo link<input type="url" name="url" required maxLength={300} className={input} /></label>
            <label className="text-[15px]">Caption<input name="caption" maxLength={500} className={input} /></label>
            <button className={`${button} w-fit`}>Add video link</button>
          </form>}
          <ul className="mt-5 divide-y divide-line">{(media ?? []).map((m) => <li key={m.id} className="flex items-center justify-between gap-4 py-3 text-[14px]">
            <span>{m.kind === "embed" ? `${m.provider} video` : m.kind === "image" ? `Image: ${m.alt_text}` : "Uploaded video"} {m.caption && `· ${m.caption}`}{m.object_path && !m.uploaded_at && " · Upload incomplete"}</span>
            <form action={removeProjectMedia}><input type="hidden" name="id" value={selected.id} /><input type="hidden" name="media" value={m.id} /><button className="underline underline-offset-4">Remove</button></form>
          </li>)}</ul>
        </div>
        <div className="mt-10 border-t border-line pt-7">
          <h3 className="heading text-[23px]">Sponsor recognition</h3>
          <p className="mt-3 text-[14px] text-muted">A sponsor must approve the exact name and any existing approved logo for this update. An anonymous bidder cannot be named here. Requests and withdrawals do not alter the sponsorship promise.</p>
          {(purchases ?? []).some((p) => Boolean((p.patrons as unknown as { profile_id: string | null }).profile_id)) && <form action={requestProjectRecognition} className="mt-5 grid gap-3">
            <input type="hidden" name="update" value={selected.id} />
            <label className="text-[15px]">Sponsorship<select name="purchase" required className={input}>
              <option value="">Choose a sponsor</option>
              {(purchases ?? []).filter((p) => Boolean((p.patrons as unknown as { profile_id: string | null }).profile_id)
                && !(recognition ?? []).some((r) => r.purchase_id === p.id)).map((p) => <option key={p.id} value={p.id}>
                {(p.patrons as unknown as { name: string }).name} · {(p.lots as unknown as { label: string }).label}
              </option>)}
            </select></label>
            <label className="text-[15px]">Proposed display name<input name="name" required maxLength={100} className={input} /></label>
            <label className="flex items-center gap-2 text-[15px]"><input name="logo" value="yes" type="checkbox" /> Include the approved placement logo if available</label>
            <button className={`${button} w-fit`}>Request approval</button>
          </form>}
          <ul className="mt-5 divide-y divide-line">{(recognition ?? []).map((r) => <li key={r.id} className="py-3 text-[14px]">{r.display_name} · {r.withdrawn_at ? "Withdrawn" : r.approved_at ? "Approved" : "Awaiting sponsor approval"}
            {!r.approved_at && <span> · <Link href={`/project-recognition/${r.id}`} className="underline underline-offset-4">Approval link</Link></span>}</li>)}</ul>
        </div>
      </>}
    </section>
  </div>;
}
