"use server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { contactNotification, sendEmail } from "@/lib/email";
import { CONTACT_REASON_KEYS, contactReasonLabel } from "@/lib/contact";

export type ContactField = "reason" | "name" | "organization" | "email" | "subject" | "message";

/** What the sender typed, echoed back so the form keeps it after a failed submit (React resets forms after actions). */
export type ContactValues = Record<ContactField, string> & { started_at: string };

export type ContactState = {
  ok: boolean;
  errors?: Partial<Record<ContactField | "form", string>>;
  values?: ContactValues;
};

const GENERIC_ERROR = "That note did not go through. Try once more.";

/** Anything faster than this from page load to submit is not a person. No cookies involved: the page carries its own load time. */
const MIN_COMPLETION_MS = 3_000;
/** A load time older than this is a stale or forged page; ask for another go. */
const MAX_COMPLETION_MS = 24 * 60 * 60 * 1000;

const Input = z.object({
  reason: z.enum(CONTACT_REASON_KEYS, { error: "Pick a reason." }),
  name: z.string().trim().min(1, "Enter a name.").max(100, "Keep the name under 100 characters."),
  organization: z.string().trim().max(160, "Keep this under 160 characters.").optional(),
  email: z.string().trim().email("Enter a valid email address."),
  subject: z.string().trim().min(3, "Add a subject of at least 3 characters.").max(160, "Keep the subject under 160 characters."),
  message: z
    .string()
    .trim()
    .min(20, "Add a message of at least 20 characters.")
    .max(5000, "Keep the message under 5,000 characters."),
  // Honeypot. Hidden from people; bots fill it in.
  website: z.string().max(0),
  // When the page rendered, in ms since the epoch.
  started_at: z.coerce.number().int().positive(),
});

const str = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function sendContactNote(_prev: ContactState, form: FormData): Promise<ContactState> {
  const values: ContactValues = {
    reason: str(form, "reason"),
    name: str(form, "name"),
    organization: str(form, "organization"),
    email: str(form, "email"),
    subject: str(form, "subject"),
    message: str(form, "message"),
    started_at: str(form, "started_at"),
  };
  const fail = (errors: ContactState["errors"]): ContactState => ({ ok: false, errors, values });

  const parsed = Input.safeParse({ ...values, organization: values.organization || undefined, website: str(form, "website") });

  if (!parsed.success) {
    const f = parsed.error.flatten().fieldErrors;
    // A filled honeypot looks like success to the sender and stores nothing.
    if (f.website) return { ok: true };
    // A missing or malformed timestamp means the form did not come from the page.
    if (f.started_at) return fail({ form: GENERIC_ERROR });
    return fail({
      reason: f.reason?.[0],
      name: f.name?.[0],
      organization: f.organization?.[0],
      email: f.email?.[0],
      subject: f.subject?.[0],
      message: f.message?.[0],
    });
  }

  const { reason, name, organization, email, subject, message, started_at } = parsed.data;
  const elapsed = Date.now() - started_at;
  if (elapsed < MIN_COMPLETION_MS || elapsed > MAX_COMPLETION_MS) return fail({ form: GENERIC_ERROR });

  // Without Supabase, dev previews pretend to save. Production never pretends.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    if (process.env.NODE_ENV === "production") {
      console.error("contact note not saved: SUPABASE_SERVICE_ROLE_KEY is not set");
      return fail({ form: GENERIC_ERROR });
    }
    console.info(`contact note (not saved, Supabase not configured): ${reason} from ${name}`);
    return { ok: true };
  }

  const createdAt = new Date();
  const { error } = await supabaseAdmin()
    .from("contact_messages")
    .insert({ reason, name, organization: organization ?? null, email: email.toLowerCase(), subject, message });
  if (error) {
    console.error("contact insert failed:", error.code, error.message);
    return fail({ form: GENERIC_ERROR });
  }

  // The note is saved. A failed notification is logged, never surfaced.
  const to = process.env.CONTACT_TO_EMAIL?.trim();
  if (!to) {
    console.warn("contact note saved but not forwarded: CONTACT_TO_EMAIL is not set");
    return { ok: true };
  }
  const result = await sendEmail(
    contactNotification({ to, reason: contactReasonLabel(reason), name, organization, email, subject, message, createdAt }),
  );
  if (!result.sent) console.warn(`contact notification not sent: ${result.reason}`);
  return { ok: true };
}
