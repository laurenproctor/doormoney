import { redirect } from "next/navigation";
import { requireUser, ownedAct } from "@/lib/auth";
import { widgetDestination } from "@/lib/dashboardModel";
import { supabaseServer } from "@/lib/supabase/server";

/*
  The widget's old address, kept for the links already sent.

  The snippet is for one exact fundraiser and takes money for that one only, so it belongs beside
  that fundraiser rather than on a page of its own two levels away (docs/DESK_REGISTER.md, PR 4).
  It lives under Share on the fundraiser's own page now, with the button and the badges, and this
  sends anybody arriving from an older link straight there: the newest published fundraiser, with
  its Share panel open.

  With nothing published there is no snippet to show and no address to copy, so this goes to Today
  instead, which says in one line where the widget will be once a fundraiser is public. An account
  with no organizer profile has nothing published either, and Today already knows what to say to it.
*/
export default async function DashboardWidgetPage() {
  const user = await requireUser("/dashboard/widget");
  const act = await ownedAct(user.id);
  if (!act) redirect(widgetDestination([]));

  const sb = await supabaseServer();
  const { data } = await sb
    .from("runs")
    .select("id,status")
    .eq("act_id", act.id)
    .in("status", ["open", "live", "closed"])
    .order("created_at", { ascending: false });

  redirect(widgetDestination((data ?? []) as { id: string; status: string }[]));
}
