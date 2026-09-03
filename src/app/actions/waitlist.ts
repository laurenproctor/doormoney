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

  const { data: inserted, error } = await supabaseAdmin()
    .from("waitlist")
    .upsert(
      { ...parsed.data, city: parsed.data.city ?? null, act_type: parsed.data.role === "band" ? (parsed.data.act_type ?? null) : null },
      { onConflict: "email,role", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return { ok: false, errors: { form: "Couldn't save that. Try once more." } };

  // Confirm new signups only. A repeat signup is already on the list and gets no second email.
  // A failed send never fails the signup; the row is saved and the email can be resent later.
  if (inserted && inserted.length > 0) {
    const { name, email, role } = parsed.data;
    const result = await sendEmail(waitlistConfirmation({ to: email, name, role }));
    if (!result.sent) console.warn(`waitlist confirmation not sent to ${email}: ${result.reason}`);
  }
  return { ok: true };
}
