// Transactional email through Resend's REST API. Server only.
// Without RESEND_API_KEY and EMAIL_FROM the app still runs; sends are skipped and reported as such.

import { SITE } from "@/lib/site";

export type Mail = { to: string; subject: string; text: string; html: string };

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/** Send one email. Never throws: the caller decides whether a failed send matters. */
export async function sendEmail(mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  if (!emailConfigured()) return { sent: false, reason: "email not configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "unknown error" };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** The waitlist confirmation. Third person throughout, per the voice rules. */
export function waitlistConfirmation(params: { to: string; name: string; role: "band" | "patron" }): Mail {
  const who = params.role === "band" ? "an act" : "a patron";
  const next =
    params.role === "band"
      ? `When listings go live, acts on the list go up first. The first fifty list free forever.`
      : `When the first boards open, patrons on the list see the bands, rooms and circuits before anyone else.`;
  const lines = [
    `${params.name} is on the ${SITE.name} list as ${who}.`,
    `${SITE.name} opens in ${SITE.city} first. ${next}`,
    `Nothing to do until then. Another email goes out the day it opens.`,
    `${SITE.tagline}`,
    `${SITE.url}`,
  ];
  const html = `<div style="font-family:Archivo,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#000;background:#EDE8DC;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:3px solid #000;padding:28px">
    <div style="font-family:Anton,Impact,sans-serif;font-size:26px;text-transform:uppercase;letter-spacing:.02em">Door <span style="color:#E03A1E">Money</span></div>
    ${lines.slice(0, 3).map((l) => `<p style="margin:18px 0 0">${escape(l)}</p>`).join("")}
    <p style="margin:24px 0 0;font-family:'Courier New',monospace;font-size:13px;color:#55524B">${escape(SITE.tagline)} <a href="${escape(SITE.url)}" style="color:#E03A1E">${escape(SITE.url)}</a></p>
  </div>
</div>`;
  return { to: params.to, subject: `On the list at ${SITE.name}`, text: lines.join("\n\n"), html };
}
