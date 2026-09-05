"use server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail, newsletterWelcome } from "@/lib/email";
import { SITE } from "@/lib/site";

export type NewsletterState = { ok: boolean; error?: string };

const Input = z.object({
  // Required, so the new-boards email can open by name. Addresses collected before this was asked
  // for keep a null in the column and get the unnamed version of the email.
  first_name: z.string().trim().min(1, "Enter a first name.").max(60, "Keep the first name under 60 characters."),
  email: z.string().trim().email("Enter a valid email address."),
  source: z.string().trim().max(80).optional(),
  // Honeypot. People never see this field; anything that fills it is a script.
  website: z.string().max(0).optional(),
});

export async function subscribeNewsletter(_prev: NewsletterState, form: FormData): Promise<NewsletterState> {
  const parsed = Input.safeParse({
    first_name: form.get("first_name"),
    email: form.get("email"),
    source: form.get("source") || undefined,
    website: form.get("website") || undefined,
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    // A filled honeypot fails on `website`; say nothing useful to the script.
    if (f.website) return { ok: true };
    return { ok: false, error: f.first_name?.[0] ?? f.email?.[0] ?? "Enter a valid email address." };
  }

  // Without Supabase configured, behave like the mockup: pretend it saved.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: true };

  const email = parsed.data.email.toLowerCase();
  const db = supabaseAdmin();

  // Plain insert. The unique index is on lower(email), which an upsert's conflict target cannot name,
  // so a duplicate surfaces as 23505 and means "already on it". Someone who had opted out and comes
  // back is flipped back on, quietly.
  const { data, error } = await db.from("newsletter").insert({ email, first_name: parsed.data.first_name, source: parsed.data.source ?? null }).select("unsubscribe_token").single();
  if (error?.code === "23505") {
    // Already on the list. Flip a lapsed address back on, and take the name either way: an address
    // collected before the form asked for one has been nameless until now.
    await db.from("newsletter").update({ unsubscribed_at: null }).eq("email", email).not("unsubscribed_at", "is", null);
    await db.from("newsletter").update({ first_name: parsed.data.first_name }).eq("email", email).is("first_name", null);
    return { ok: true };
  }
  if (error || !data) {
    console.error("newsletter insert failed:", error?.code, error?.message);
    return { ok: false, error: "Couldn't save that. Try once more." };
  }

  // Welcome new addresses only. A failed send never fails the signup.
  const unsubscribeUrl = `${SITE.url}/newsletter/unsubscribe?t=${data.unsubscribe_token}`;
  const result = await sendEmail(newsletterWelcome({ to: email, firstName: parsed.data.first_name, unsubscribeUrl }));
  if (!result.sent) console.warn(`newsletter welcome not sent to ${email}: ${result.reason}`);
  return { ok: true };
}
