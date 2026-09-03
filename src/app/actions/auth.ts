"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SITE } from "@/lib/site";
import { safeNext } from "@/lib/auth";

export type LoginState = { ok: boolean; email?: string; error?: string };

const Input = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  next: z.string().optional(),
});

/** Sends a one-time sign-in link. Creates the account on first use. */
export async function sendMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Input.safeParse({ email: form.get("email"), next: form.get("next") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  const email = parsed.data.email.toLowerCase();
  const next = safeNext(parsed.data.next);
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${SITE.url}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    console.error("magic link failed:", error.message);
    const busy = /rate|limit/i.test(error.message);
    return { ok: false, error: busy ? "Too many links sent to that address. Try again in a few minutes." : "That link did not send. Try once more." };
  }
  return { ok: true, email };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}
