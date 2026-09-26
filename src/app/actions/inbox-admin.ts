"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { UUID } from "@/lib/inbox";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function resolveInboxReport(form: FormData) {
  const staff = await requireAdmin();
  const id = String(form.get("report") ?? "");
  if (!UUID.test(id)) redirect("/admin/inbox");
  const sb = supabaseAdmin();
  const { data: report } = await sb.from("inbox_reports").select("thread_id").eq("id", id).maybeSingle();
  if (!report) redirect("/admin/inbox");
  const { error } = await sb.from("inbox_reports").update({ resolved_at: new Date().toISOString(), reviewed_by: staff.id }).eq("id", id).is("resolved_at", null);
  if (error) throw new Error("Could not resolve inbox report");
  revalidatePath("/admin/inbox");
  redirect(`/admin/inbox/${report.thread_id}`);
}
