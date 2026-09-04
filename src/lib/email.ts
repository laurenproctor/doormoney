// Transactional email through Resend's REST API. Server only.
// Without RESEND_API_KEY and EMAIL_FROM the app still runs; sends are skipped and reported as such.

import { SITE } from "@/lib/site";

export type Mail = { to: string; subject: string; text: string; html: string; replyTo?: string };

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
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    if (!res.ok) return { sent: false, reason: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "unknown error" };
  }
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** Internal notification for a note sent through /contact. Goes to CONTACT_TO_EMAIL; reply-to is the sender. */
export function contactNotification(params: {
  to: string;
  reason: string;
  name: string;
  organization?: string | null;
  email: string;
  subject: string;
  message: string;
  createdAt: Date;
}): Mail {
  const when = params.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" });
  const rows: [string, string][] = [
    ["Reason", params.reason],
    ["Name", params.name],
    ...(params.organization ? ([["Organization", params.organization]] as [string, string][]) : []),
    ["Reply to", params.email],
    ["Subject", params.subject],
    ["Sent", `${when} (New York)`],
  ];
  const text = [...rows.map(([k, v]) => `${k}: ${v}`), "", params.message].join("\n");
  const html = `<div style="font-family:Archivo,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#000;background:#EDE8DC;padding:32px">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:3px solid #000;padding:28px">
    <div style="font-family:Anton,Impact,sans-serif;font-size:26px;text-transform:uppercase;letter-spacing:.02em">Door <span style="color:#E03A1E">Money</span></div>
    <table style="margin:18px 0 0;border-collapse:collapse;font-family:'Courier New',monospace;font-size:14px">
      ${rows.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#55524B;vertical-align:top">${escape(k)}</td><td style="padding:2px 0">${escape(v)}</td></tr>`).join("")}
    </table>
    <p style="margin:22px 0 0;white-space:pre-wrap;border-top:2px dashed #55524B;padding-top:18px">${escape(params.message)}</p>
  </div>
</div>`;
  return { to: params.to, subject: `New ${SITE.name} note: ${params.subject}`, text, html, replyTo: params.email };
}

/* ---------------------------------------------------------------------------------------------
   Phase 3 notes. One shell for all of them: paper-light so every mail client renders it, the
   serif wordmark and the house blue for the one line that matters. Third person throughout.
   --------------------------------------------------------------------------------------------- */

const BLUE = "#3D5AFE";

/** Wraps a few paragraphs (already escaped HTML) in the Door Money letterhead. */
function shell(paragraphs: string[], footer?: string) {
  return `<div style="font-family:Archivo,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#0a0a0a;background:#f4f0e8;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d8d3c8;padding:32px">
    <div style="font-family:'Bodoni MT',Didot,Georgia,serif;font-size:28px;text-transform:uppercase;letter-spacing:.04em;line-height:1">Door Money</div>
    ${paragraphs.map((html, i) => `<p style="margin:${i === 0 ? 26 : 16}px 0 0">${html}</p>`).join("")}
    <p style="margin:28px 0 0;padding-top:16px;border-top:1px solid #d8d3c8;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b675f">${escape(footer ?? SITE.tagline)} <a href="${escape(SITE.url)}" style="color:${BLUE}">${escape(SITE.url.replace(/^https?:\/\//, ""))}</a></p>
  </div>
</div>`;
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: cents % 100 ? 2 : 0 });

/** To the patron, the moment a fixed-price spot is paid for. The Door Money record; Stripe may send its own receipt too. */
export function purchaseReceipt(params: { to: string; patronName: string; lotName: string; actName: string; runTitle: string; amountCents: number; boardUrl: string; recordUrl: string }): Mail {
  const lines = [
    `${params.patronName} holds the ${params.lotName.toLowerCase()} on ${params.actName}'s ${params.runTitle.toLowerCase()}. ${money(params.amountCents)}, paid.`,
    `Door Money holds the money and pays ${params.actName} every Friday through the run. Nothing is charged again.`,
    `${params.actName} approves the mark before it goes on anything. Door Money emails when it is time to send one.`,
    `The record of the run lives at ${params.recordUrl} and fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> holds the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())}. <b style="color:${BLUE}">${money(params.amountCents)}</b>, paid.`,
    escape(lines[1]),
    escape(lines[2]),
    `The <a href="${escape(params.recordUrl)}" style="color:${BLUE}">record of the run</a> fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
    `The board: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `${params.lotName} on ${params.actName}'s ${params.runTitle.toLowerCase()}: paid`, text: lines.join("\n\n"), html };
}

/** To the act, the moment one of its spots sells. */
export function saleNotice(params: { to: string; actName: string; lotName: string; patronName: string; amountCents: number; netCents: number; boardUrl: string; dashboardUrl: string }): Mail {
  const lines = [
    `${params.patronName} took the ${params.lotName.toLowerCase()} on ${params.actName}'s board for ${money(params.amountCents)}.`,
    `${money(params.netCents)} reaches ${params.actName} in weekly slices, every Friday through the run. Door Money keeps ${SITE.feePercent}%.`,
    `The patron's mark needs a yes on the dashboard before it goes on anything: ${params.dashboardUrl}`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> took the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s board for <b style="color:${BLUE}">${money(params.amountCents)}</b>.`,
    escape(lines[1]),
    `The patron's mark needs a yes on the dashboard before it goes on anything: <a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">${escape(params.dashboardUrl)}</a>`,
    `The board: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Sold: ${params.lotName} to ${params.patronName}`, text: lines.join("\n\n"), html };
}

/** To the act, each Friday something moves. */
export function payoutNotice(params: { to: string; actName: string; amountCents: number; sliceCount: number; dashboardUrl: string }): Mail {
  const slices = params.sliceCount === 1 ? "one placement" : `${params.sliceCount} placements`;
  const lines = [
    `Door Money sent ${money(params.amountCents)} to ${params.actName} today, this week's slice across ${slices}.`,
    `It lands in the bank on Stripe's schedule, usually within two business days.`,
    `Payout details: ${params.dashboardUrl}`,
  ];
  const html = shell([
    `Door Money sent <b style="color:${BLUE}">${money(params.amountCents)}</b> to ${escape(params.actName)} today, this week's slice across ${escape(slices)}.`,
    escape(lines[1]),
    `Payout details: <a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">${escape(params.dashboardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `${money(params.amountCents)} on its way to ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To the patron when the act cancels the run. Says exactly what went back and what stayed. */
export function cancellationNotice(params: { to: string; patronName: string; actName: string; runTitle: string; lotName: string; refundedCents: number; amountCents: number; recordUrl: string }): Mail {
  const all = params.refundedCents >= params.amountCents;
  const back = all
    ? `${money(params.refundedCents)}, the whole amount, goes back to the card it was paid with.`
    : params.refundedCents > 0
      ? `${money(params.refundedCents)} of the ${money(params.amountCents)} goes back to the card it was paid with. The rest paid for the weeks the run played and stays with ${params.actName}.`
      : `Every slice had already been released for weeks the run played, so nothing is owed back.`;
  const lines = [
    `${params.actName} cancelled the ${params.runTitle.toLowerCase()}. ${params.patronName}'s ${params.lotName.toLowerCase()} comes off the board with it.`,
    back,
    `Refunds take five to ten business days to show up, depending on the bank.`,
    `The record of what did run: ${params.recordUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.actName)}</b> cancelled the ${escape(params.runTitle.toLowerCase())}. ${escape(params.patronName)}'s ${escape(params.lotName.toLowerCase())} comes off the board with it.`,
    `<b style="color:${BLUE}">${escape(back)}</b>`,
    escape(lines[2]),
    `The record of what did run: <a href="${escape(params.recordUrl)}" style="color:${BLUE}">${escape(params.recordUrl)}</a>`,
  ]);
  return { to: params.to, subject: `${params.actName} cancelled the ${params.runTitle.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/** To the patron when the run closes: the record is complete. */
export function recordReady(params: { to: string; patronName: string; actName: string; runTitle: string; lotName: string; playedCount: number; showCount: number; recordUrl: string }): Mail {
  const unit = params.showCount === 1 ? "show" : "shows";
  const lines = [
    `${params.actName}'s ${params.runTitle.toLowerCase()} is over. ${params.patronName}'s ${params.lotName.toLowerCase()} was in the room for ${params.playedCount} of ${params.showCount} ${unit}.`,
    `The record has every date, the rooms, the attendance where ${params.actName} counted it, and where the money went: ${params.recordUrl}`,
    `Support a patron can point at. Thank you for putting money behind the music.`,
  ];
  const html = shell([
    `<b>${escape(params.actName)}</b>'s ${escape(params.runTitle.toLowerCase())} is over. ${escape(params.patronName)}'s ${escape(params.lotName.toLowerCase())} was in the room for <b style="color:${BLUE}">${params.playedCount} of ${params.showCount} ${unit}</b>.`,
    `The record has every date, the rooms, the attendance where ${escape(params.actName)} counted it, and where the money went: <a href="${escape(params.recordUrl)}" style="color:${BLUE}">${escape(params.recordUrl)}</a>`,
    escape(lines[2]),
  ]);
  return { to: params.to, subject: `The record: ${params.actName}, ${params.runTitle.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/** To the fan, the moment a backing is paid. */
export function backingReceipt(params: { to: string; displayName: string; actName: string; runTitle: string; place: string; amountCents: number; boardUrl: string; recordUrl: string }): Mail {
  const lines = [
    `${params.displayName} backs ${params.actName}'s ${params.runTitle.toLowerCase()}. ${money(params.amountCents)}, paid.`,
    `The name goes on ${params.place} when the run wraps, exactly as it was typed.`,
    `Door Money holds the money and pays ${params.actName} every Friday through the run. Nothing is charged again. Refunded in full if the run is cancelled.`,
    `The record of the run lives at ${params.recordUrl} and fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.displayName)}</b> backs ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())}. <b style="color:${BLUE}">${money(params.amountCents)}</b>, paid.`,
    escape(lines[1]),
    escape(lines[2]),
    `The <a href="${escape(params.recordUrl)}" style="color:${BLUE}">record of the run</a> fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
    `The board: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Backing ${params.actName}'s ${params.runTitle.toLowerCase()}: paid`, text: lines.join("\n\n"), html };
}

/** To the act, the moment a fan backs the run. */
export function backingNotice(params: { to: string; actName: string; displayName: string; place: string; amountCents: number; netCents: number; dashboardUrl: string }): Mail {
  const lines = [
    `${params.displayName} backed ${params.actName}'s run for ${money(params.amountCents)}. The name goes on ${params.place}.`,
    `${params.actName}'s share is ${money(params.netCents)} after Door Money's ${SITE.feePercent}%. It arrives in Friday slices through the run.`,
    `Every backer's name is on the dashboard: ${params.dashboardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.displayName)}</b> backed ${escape(params.actName)}'s run for <b style="color:${BLUE}">${money(params.amountCents)}</b>. The name goes on ${escape(params.place)}.`,
    escape(lines[1]),
    `Every backer's name is on the dashboard: <a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">${escape(params.dashboardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Backed: ${params.displayName}, ${money(params.amountCents)}`, text: lines.join("\n\n"), html };
}

/** To a new address on the new-boards email. Says what arrives, how often, and how to stop it. */
export function newsletterWelcome(params: { to: string; unsubscribeUrl: string }): Mail {
  const lines = [
    `This address is on the ${SITE.name} new-boards email.`,
    `New musicians open boards on ${SITE.name} every week: a band about to tour, a house act starting a residency, a soloist booking a season. One short email says who they are, where they play and what is still open to back. Never more than once a week.`,
    `Nothing to do now. The next one arrives the week a board opens.`,
    `To stop the emails: ${params.unsubscribeUrl}`,
  ];
  const html = shell([
    `This address is on the <b>${escape(SITE.name)} new-boards email</b>.`,
    escape(lines[1]),
    escape(lines[2]),
    `To stop the emails: <a href="${escape(params.unsubscribeUrl)}" style="color:${BLUE}">unsubscribe</a>.`,
  ]);
  return { to: params.to, subject: `New boards on ${SITE.name}, by email`, text: lines.join("\n\n"), html };
}
