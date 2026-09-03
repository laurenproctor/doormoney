"use server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendEmail, waitlistConfirmation } from "@/lib/email";

export type WaitlistState = {
  ok: boolean;
  errors?: { name?: string; email?: string; form?: string };
};

const Input = z.object({
  role: z.enum(["band", "patron"]),
  name: z.string().trim().min(1, "Enter a name."),
  email: z.string().trim().email("Enter a valid email address."),
  city: z.string().trim().max(80).optional(),
  act_type: z.enum(["touring_band", "house_act", "soloist"]).optional(),
});

export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  const parsed = Input.safeParse({
    role: form.get("role"),
    name: form.get("name"),
    email: form.get("email"),
    city: form.get("city") || undefined,
    act_type: form.get("act_type") || undefined,
  });
  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    return { ok: false, errors: { name: f.name?.[0], email: f.email?.[0] } };
  }

  // Without Supabase configured, behave like the mockup: pretend it saved.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return { ok: true };

  // Plain insert. The unique index is on lower(email) and role, which an upsert's conflict target
  // cannot name, so a duplicate surfaces as error 23505 and means "already on the list".
  const { name, email, role, city, act_type } = parsed.data;
  const { error } = await supabaseAdmin()
    .from("waitlist")
    .insert({ role, name, email: email.toLowerCase(), city: city ?? null, act_type: role === "band" ? (act_type ?? null) : null });
  if (error?.code === "23505") return { ok: true };
  if (error) {
    console.error("waitlist insert failed:", error.code, error.message);
    return { ok: false, errors: { form: "Couldn't save that. Try once more." } };
  }

  // Confirm new signups only. A failed send never fails the signup; the row is saved and the email can be resent later.
  const result = await sendEmail(waitlistConfirmation({ to: email, name, role }));
  if (!result.sent) console.warn(`waitlist confirmation not sent to ${email}: ${result.reason}`);
  return { ok: true };
}
