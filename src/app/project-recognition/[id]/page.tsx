import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { UUID } from "@/lib/project-updates";
import { supabaseAdmin } from "@/lib/supabase/server";
import { decideProjectRecognition } from "@/app/actions/project-recognition";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Theme } from "@/components/Theme";

type Props = { params: Promise<{ id: string }> };
export default async function RecognitionPage({ params }: Props) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser(`/project-recognition/${id}`);
  const { data } = await supabaseAdmin().from("project_update_recognition")
    .select("id,display_name,logo_url,approved_at,withdrawn_at,project_updates!inner(title,run_id,runs!inner(title))")
    .eq("id", id).eq("sponsor_id", user.id).maybeSingle();
  if (!data) notFound();
  const update = data.project_updates as unknown as { title: string; runs: { title: string } };
  return <Theme name="blue"><Nav /><main id="main" className="mx-auto w-full max-w-[700px] flex-1 px-7 py-16">
    <p className="caps text-[14px]">Sponsor approval</p>
    <h1 className="heading mt-5 text-[clamp(32px,5vw,50px)]">Your name in a project update</h1>
    <p className="mt-6 text-[16px] leading-[1.7]">The organizer of {update.runs.title} wants to recognize you in “{update.title}.” Only the name and any logo shown below will appear after you approve. Your purchase and its existing placement terms stay separate.</p>
    <div className="mt-8 rounded border border-line p-6"><p className="text-[18px]">{data.display_name}</p>
      {data.logo_url && <p className="mt-3 text-[15px]">The approved placement logo will be included.</p>}
      <p className="mt-4 text-[15px] text-muted">{data.approved_at && !data.withdrawn_at ? "Currently approved" : data.withdrawn_at ? "Approval withdrawn" : "Awaiting approval"}</p>
    </div>
    <div className="mt-8 flex flex-wrap gap-4">
      {(!data.approved_at || data.withdrawn_at) && <form action={decideProjectRecognition}><input type="hidden" name="id" value={id} /><button name="intent" value="approve" className="rounded border border-current px-5 py-3 text-[15px]">Approve this mention</button></form>}
      <form action={decideProjectRecognition}><input type="hidden" name="id" value={id} /><button name="intent" value="withdraw" className="rounded border border-current px-5 py-3 text-[15px]">{data.approved_at && !data.withdrawn_at ? "Withdraw approval" : "Decline"}</button></form>
    </div>
  </main><Footer /></Theme>;
}
