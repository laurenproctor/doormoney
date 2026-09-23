import { redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";

/*
  The widget's old address, kept for the links already sent.

  The snippet is for one exact fundraiser and takes money for that one only, so it belongs beside
  that fundraiser rather than in a page of its own two levels away (docs/DESK_REGISTER.md, PR 4).
  It lives under Share on the fundraiser's own page now, and this sends anybody arriving from an
  older link straight there: the newest published fundraiser, with its Share panel open.

  With nothing published there is no snippet to show and no address to copy, so this goes to the
  list instead of to a panel that would have nothing in it.
*/
export default async function DashboardWidgetPage() {
  const user = await requireUser("/dashboard/widget");
  const act = await ownedAct(user.id);
  // The widget embeds a fundraiser, which needs an organizer profile first.
  if (!act) redirect("/dashboard/act/new");

  const sb = await supabaseServer();
  const { data } = await sb
    .from("runs")
    .select("id,starts_on")
    .eq("act_id", act.id)
    .in("status", ["open", "live"])
    .order("starts_on", { ascending: false })
    .limit(1);

  const newest = (data ?? [])[0] as { id: string } | undefined;
  redirect(newest ? `/dashboard/runs/${newest.id}?share=1` : "/dashboard/runs");
}
