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
    `If the run stops happening, saying so at ${params.recordUrl}/flag holds the rest of the money until Door Money looks.`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> holds the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())}. <b style="color:${BLUE}">${money(params.amountCents)}</b>, paid.`,
    escape(lines[1]),
    escape(lines[2]),
    `The <a href="${escape(params.recordUrl)}" style="color:${BLUE}">record of the run</a> fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
    `If the run stops happening, <a href="${escape(params.recordUrl)}/flag" style="color:${BLUE}">saying so</a> holds the rest of the money until Door Money looks.`,
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

/* ---------------------------------------------------------------------------------------------
   Phase 5 notes: the auction mails. Third person, and every one of them says what to do next.
   --------------------------------------------------------------------------------------------- */

const when = (d: Date) =>
  d.toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " New York time";

/** To the patron who just lost the lead on a lot. */
export function outbidNotice(params: { to: string; patronName: string; actName: string; lotName: string; yourCents: number; topCents: number; minimumCents: number; closesAt: Date | null; boardUrl: string }): Mail {
  const lines = [
    `Someone bid ${money(params.topCents)} on the ${params.lotName.toLowerCase()} for ${params.actName}. ${params.patronName}'s ${money(params.yourCents)} is no longer the top bid.`,
    `The next bid starts at ${money(params.minimumCents)}.${params.closesAt ? ` Bidding closes ${when(params.closesAt)}.` : ""}`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `Someone bid <b style="color:${BLUE}">${money(params.topCents)}</b> on the ${escape(params.lotName.toLowerCase())} for ${escape(params.actName)}. ${escape(params.patronName)}'s ${money(params.yourCents)} is no longer the top bid.`,
    escape(lines[1]),
    `The board: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Outbid on the ${params.lotName.toLowerCase()}, ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To everyone in an auction, a day before it closes. */
export function closingSoon(params: { to: string; patronName: string; actName: string; lotName: string; topCents: number; leading: boolean; minimumCents: number; closesAt: Date; boardUrl: string }): Mail {
  const lead = params.leading
    ? `${params.patronName} holds the top bid on the ${params.lotName.toLowerCase()} for ${params.actName}, at ${money(params.topCents)}.`
    : `The ${params.lotName.toLowerCase()} for ${params.actName} is at ${money(params.topCents)}. The next bid starts at ${money(params.minimumCents)}.`;
  const lines = [
    `Bidding closes ${when(params.closesAt)}.`,
    lead,
    `Whoever holds the top bid at the close has ${48} hours to put the money up. Door Money holds it and pays ${params.actName} weekly through the run.`,
    `The board: ${params.boardUrl}`,
  ];
  const html = shell([
    `<b>Bidding closes ${escape(when(params.closesAt))}.</b>`,
    escape(lead),
    escape(lines[2]),
    `The board: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Closing soon: the ${params.lotName.toLowerCase()}, ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To the winning bidder, with the private link that takes the money. Also used when a lot rolls down. */
export function auctionWon(params: { to: string; patronName: string; actName: string; runTitle: string; lotName: string; amountCents: number; hours: number; deadline: Date; payUrl: string }): Mail {
  const lines = [
    `${params.patronName} won the ${params.lotName.toLowerCase()} on ${params.actName}'s ${params.runTitle.toLowerCase()} at ${money(params.amountCents)}.`,
    `The spot is held until ${when(params.deadline)}, ${params.hours} hours from the close. After that it goes to the next bid.`,
    `Put the money up here: ${params.payUrl}`,
    `Door Money holds it and pays ${params.actName} weekly through the run. ${params.actName} approves the mark before it goes on anything.`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> won the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())} at <b style="color:${BLUE}">${money(params.amountCents)}</b>.`,
    escape(lines[1]),
    `<a href="${escape(params.payUrl)}" style="color:${BLUE}"><b>Put the money up</b></a>`,
    escape(lines[3]),
  ]);
  return { to: params.to, subject: `Won: the ${params.lotName.toLowerCase()}, ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To everyone who bid, when a patron takes the spot outright at the take-it-now price. */
export function spotTaken(params: { to: string; patronName: string; actName: string; lotName: string; yourCents: number; takenAtCents: number; boardUrl: string }): Mail {
  const lines = [
    `The ${params.lotName.toLowerCase()} for ${params.actName} was taken at the ${money(params.takenAtCents)} take-it-now price, so the bidding is over.`,
    `${params.patronName}'s ${money(params.yourCents)} bid was never charged, and nothing is owed.`,
    `Other placements on the run are still open: ${params.boardUrl}`,
  ];
  const html = shell([
    `The ${escape(params.lotName.toLowerCase())} for ${escape(params.actName)} was taken at the <b style="color:${BLUE}">${money(params.takenAtCents)}</b> take-it-now price, so the bidding is over.`,
    escape(lines[1]),
    `Other placements on the run are still open: <a href="${escape(params.boardUrl)}" style="color:${BLUE}">${escape(params.boardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Taken: the ${params.lotName.toLowerCase()}, ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To the act when an auction ends with nothing at the reserve. */
export function auctionUnsold(params: { to: string; actName: string; lotName: string; reserveCents: number; dashboardUrl: string }): Mail {
  const lines = [
    `The ${params.lotName.toLowerCase()} closed without a bid at the ${money(params.reserveCents)} reserve, so it comes off the board.`,
    `It can go back up at a lower number, or as a fixed price, from the dashboard.`,
    `The dashboard: ${params.dashboardUrl}`,
  ];
  const html = shell([
    `The ${escape(params.lotName.toLowerCase())} closed without a bid at the <b>${money(params.reserveCents)}</b> reserve, so it comes off the board.`,
    escape(lines[1]),
    `The dashboard: <a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">${escape(params.dashboardUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Unsold: the ${params.lotName.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/* ---------------------------------------------------------------------------------------------
   Phase 6: the patron flag. One to Door Money, one back to the patron. The act is not told here;
   Door Money looks first.
   --------------------------------------------------------------------------------------------- */

/** To Door Money, the moment a patron says a run is not happening. */
export function flagRaised(params: { to: string; patronName: string; what: string; actName: string; runTitle: string; note: string | null; pausedCount: number; adminUrl: string; recordUrl: string }): Mail {
  const held = params.pausedCount === 1 ? "one slice is on hold" : `${params.pausedCount} slices are on hold`;
  const lines = [
    `${params.patronName} does not think ${params.actName}'s ${params.runTitle.toLowerCase()} is running, and holds ${params.what}.`,
    params.note ? `What they said: ${params.note}` : `They left no note.`,
    `Nothing more moves on it: ${held}. Money already released stays released.`,
    `The record: ${params.recordUrl}`,
    `The queue: ${params.adminUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> does not think ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())} is running, and holds ${escape(params.what)}.`,
    params.note ? `What they said: <b>${escape(params.note)}</b>` : escape(lines[1]),
    `<b style="color:${BLUE}">${escape(lines[2])}</b>`,
    `The record: <a href="${escape(params.recordUrl)}" style="color:${BLUE}">${escape(params.recordUrl)}</a>`,
    `The queue: <a href="${escape(params.adminUrl)}" style="color:${BLUE}">${escape(params.adminUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Flagged: ${params.actName}, ${params.runTitle.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/** Back to the patron who raised it, so they know it landed and what happens next. */
export function flagConfirmation(params: { to: string; patronName: string; what: string; actName: string; runTitle: string; pausedCount: number; recordUrl: string }): Mail {
  const lines = [
    `Door Money has ${params.patronName}'s note about ${params.actName}'s ${params.runTitle.toLowerCase()}.`,
    params.pausedCount > 0
      ? `Every payment still to go out on ${params.what} is on hold while Door Money looks. Nothing further reaches ${params.actName} until then.`
      : `Nothing was left to send on ${params.what}, so there is nothing to hold. Door Money will look anyway.`,
    `Someone will be in touch. If the run did not happen, the unreleased part goes back to the card it was paid with.`,
    `The record: ${params.recordUrl}`,
  ];
  const html = shell([
    `Door Money has <b>${escape(params.patronName)}</b>'s note about ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())}.`,
    `<b style="color:${BLUE}">${escape(lines[1])}</b>`,
    escape(lines[2]),
    `The record: <a href="${escape(params.recordUrl)}" style="color:${BLUE}">${escape(params.recordUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Door Money is looking into ${params.actName}'s ${params.runTitle.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/* ---------------------------------------------------------------------------------------------
   Phase 7: the mail that goes out on a schedule. One to the new-boards list, one to Door Money.
   --------------------------------------------------------------------------------------------- */

export type NewBoard = { actName: string; city: string; runTitle: string; showCount: number; dates: string; openSpots: number; fromCents: number | null; boardUrl: string };

/** The new-boards email: the week's boards, to everyone on the list. */
export function newBoardsEmail(params: { to: string; boards: NewBoard[]; unsubscribeUrl: string }): Mail {
  const n = params.boards.length;
  const heading = n === 1 ? `${params.boards[0].actName} opened a board on ${SITE.name}.` : `${n} musicians opened boards on ${SITE.name} this week.`;
  const line = (b: NewBoard) => {
    const open = b.openSpots === 1 ? "one placement open" : `${b.openSpots} placements open`;
    const from = b.fromCents ? `, from ${money(b.fromCents)}` : "";
    return `${b.actName}, ${b.city}. ${b.runTitle}, ${b.showCount} ${b.showCount === 1 ? "show" : "shows"}, ${b.dates}. ${open}${from}. ${b.boardUrl}`;
  };
  const lines = [heading, ...params.boards.map(line), `Backing a run puts money behind musicians who are already playing. Door Money holds it and pays them weekly through the run.`, `To stop these emails: ${params.unsubscribeUrl}`];
  const html = shell([
    `<b>${escape(heading)}</b>`,
    ...params.boards.map((b) => {
      const open = b.openSpots === 1 ? "one placement open" : `${b.openSpots} placements open`;
      const from = b.fromCents ? `, from ${money(b.fromCents)}` : "";
      return `<a href="${escape(b.boardUrl)}" style="color:${BLUE};font-weight:bold">${escape(b.actName)}</a>, ${escape(b.city)}.<br>${escape(b.runTitle)}, ${b.showCount} ${b.showCount === 1 ? "show" : "shows"}, ${escape(b.dates)}.<br>${escape(open)}${escape(from)}.`;
    }),
    escape(lines[lines.length - 2]),
  ], `${SITE.tagline} <a href="${escape(params.unsubscribeUrl)}" style="color:${BLUE}">Unsubscribe</a>.`);
  return { to: params.to, subject: n === 1 ? `New board: ${params.boards[0].actName}` : `${n} new boards on ${SITE.name}`, text: lines.join("\n\n"), html };
}

export type DigestNumbers = {
  from: string;
  to: string;
  boardsOpened: number;
  spotsSold: number;
  soldCents: number;
  backings: number;
  backedCents: number;
  paidOutCents: number;
  heldCents: number;
  openFlags: number;
  newSubscribers: number;
  newNotes: number;
  actsTotal: number;
  boardsLive: number;
};

/** The week in numbers, to Door Money. Nobody else gets this one. */
export function weeklyDigest(params: { to: string; n: DigestNumbers; adminUrl: string }): Mail {
  const n = params.n;
  const rows: [string, string][] = [
    ["Boards opened", String(n.boardsOpened)],
    ["Placements sold", `${n.spotsSold} for ${money(n.soldCents)}`],
    ["Fan backings", `${n.backings} for ${money(n.backedCents)}`],
    ["Sent to musicians", money(n.paidOutCents)],
    ["Held for later weeks", money(n.heldCents)],
    ["Flags waiting", String(n.openFlags)],
    ["New on the boards email", String(n.newSubscribers)],
    ["Notes through contact", String(n.newNotes)],
  ];
  const lines = [
    `${SITE.name}, the week to ${n.to}.`,
    ...rows.map(([k, v]) => `${k}: ${v}`),
    `Running total: ${n.actsTotal} ${n.actsTotal === 1 ? "act" : "acts"} listed, ${n.boardsLive} ${n.boardsLive === 1 ? "board" : "boards"} up.`,
    `Everything: ${params.adminUrl}`,
  ];
  const html = shell([
    `<b>${escape(SITE.name)}</b>, the week to ${escape(n.to)}.`,
    `<table style="border-collapse:collapse;font-size:15px">${rows
      .map(([k, v]) => `<tr><td style="padding:4px 18px 4px 0;color:#6b675f">${escape(k)}</td><td style="padding:4px 0"><b>${escape(v)}</b></td></tr>`)
      .join("")}</table>`,
    escape(lines[lines.length - 2]),
    `Everything: <a href="${escape(params.adminUrl)}" style="color:${BLUE}">${escape(params.adminUrl)}</a>`,
  ]);
  return { to: params.to, subject: `${SITE.name}, week to ${n.to}`, text: lines.join("\n\n"), html };
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

/* ---------------------------------------------------------------------------------------------
   The mark, both directions. The act's yes or no decides whether a placement runs at all, so
   neither side should have to check a dashboard to find out where it stands.
   --------------------------------------------------------------------------------------------- */

/** To the act, the moment a patron sends a mark. */
export function markWaiting(params: { to: string; actName: string; patronName: string; lotName: string; note: string | null; dashboardUrl: string }): Mail {
  const lines = [
    `${params.patronName} sent the mark for the ${params.lotName.toLowerCase()} on ${params.actName}'s board.`,
    ...(params.note ? [`Their note: "${params.note}"`] : []),
    `Nothing goes on the ${params.lotName.toLowerCase()} until ${params.actName} says yes. A no refunds the patron in full and puts the spot back on the board.`,
    `Approve or decline it here: ${params.dashboardUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> sent the mark for the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s board.`,
    ...(params.note ? [`Their note: <i>${escape(params.note)}</i>`] : []),
    escape(`Nothing goes on the ${params.lotName.toLowerCase()} until ${params.actName} says yes. A no refunds the patron in full and puts the spot back on the board.`),
    `<a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">Approve or decline it</a>`,
  ]);
  return { to: params.to, subject: `A mark to look at: ${params.patronName} on the ${params.lotName.toLowerCase()}`, text: lines.join("\n\n"), html };
}

/** To the patron, when the act says yes. */
export function markApproved(params: { to: string; patronName: string; actName: string; lotName: string; recordUrl: string }): Mail {
  const lines = [
    `${params.actName} approved the mark for the ${params.lotName.toLowerCase()}.`,
    `It stays on the ${params.lotName.toLowerCase()} for the whole run. Nothing else is needed.`,
    `The record fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went. ${params.recordUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.actName)}</b> approved the mark for the ${escape(params.lotName.toLowerCase())}.`,
    escape(lines[1]),
    `The <a href="${escape(params.recordUrl)}" style="color:${BLUE}">record of the run</a> fills in as the run goes on: the shows, the rooms, the attendance where it is known, and where the money went.`,
  ]);
  return { to: params.to, subject: `${params.actName} approved the mark`, text: lines.join("\n\n"), html };
}

/** To the patron, when the act says no. The placement never runs, so the money goes back. */
export function markDeclined(params: { to: string; patronName: string; actName: string; lotName: string; refundedCents: number; boardsUrl: string }): Mail {
  const lines = [
    `${params.actName} declined the mark for the ${params.lotName.toLowerCase()}, so the placement never runs.`,
    `${money(params.refundedCents)} goes back to the card it was paid with. Refunds take five to ten business days to show up, depending on the bank.`,
    `Every musician keeps the final say on what appears beside their name. That rule is what makes a placement worth having.`,
    `The open boards: ${params.boardsUrl}`,
  ];
  const html = shell([
    `<b>${escape(params.actName)}</b> declined the mark for the ${escape(params.lotName.toLowerCase())}, so the placement never runs.`,
    `<b style="color:${BLUE}">${money(params.refundedCents)}</b> goes back to the card it was paid with. Refunds take five to ten business days to show up, depending on the bank.`,
    escape(lines[2]),
    `The <a href="${escape(params.boardsUrl)}" style="color:${BLUE}">open boards</a>`,
  ]);
  return { to: params.to, subject: `${params.actName} declined the mark, and the money went back`, text: lines.join("\n\n"), html };
}

/** To the patron whose spot is paid for but whose mark has not arrived. Sent once. */
export function markReminder(params: { to: string; patronName: string; actName: string; lotName: string; runTitle: string; markUrl: string }): Mail {
  const lines = [
    `${params.patronName} holds the ${params.lotName.toLowerCase()} on ${params.actName}'s ${params.runTitle.toLowerCase()}, paid for and waiting on one thing.`,
    `The mark is the name or logo as it will appear. Until it arrives, ${params.actName} has nothing to approve and nothing can go up.`,
    `A logo file, a name, or both: ${params.markUrl}`,
    `This is the only reminder Door Money sends.`,
  ];
  const html = shell([
    `<b>${escape(params.patronName)}</b> holds the ${escape(params.lotName.toLowerCase())} on ${escape(params.actName)}'s ${escape(params.runTitle.toLowerCase())}, paid for and waiting on one thing.`,
    escape(lines[1]),
    `A logo file, a name, or both: <a href="${escape(params.markUrl)}" style="color:${BLUE}">send the mark</a>`,
    escape(lines[3]),
  ]);
  return { to: params.to, subject: `The ${params.lotName.toLowerCase()} is paid for. The mark is still to come.`, text: lines.join("\n\n"), html };
}

/* ---------------------------------------------------------------------------------------------
   Money moving, or failing to.
   --------------------------------------------------------------------------------------------- */

/** To the act, when Stripe finishes onboarding and payouts switch on. */
export function payoutsOn(params: { to: string; actName: string; dashboardUrl: string }): Mail {
  const lines = [
    `Stripe has what it needs. Payouts are on for ${params.actName}.`,
    `Money from every placement reaches ${params.actName} every Friday through the run, straight to the bank account Stripe holds. Door Money keeps ${SITE.feePercent}% of what sells and nothing else.`,
    `Nothing to chase and no invoices to send. The dashboard shows what is scheduled: ${params.dashboardUrl}`,
  ];
  const html = shell([
    `Stripe has what it needs. <b style="color:${BLUE}">Payouts are on</b> for ${escape(params.actName)}.`,
    escape(lines[1]),
    `Nothing to chase and no invoices to send. The <a href="${escape(params.dashboardUrl)}" style="color:${BLUE}">dashboard</a> shows what is scheduled.`,
  ]);
  return { to: params.to, subject: `Payouts are on for ${params.actName}`, text: lines.join("\n\n"), html };
}

/** To the patron, when money goes back outside the cancel and decline paths (a refund made by hand). */
export function refundIssued(params: { to: string; patronName: string; actName: string; what: string; refundedCents: number; full: boolean; recordUrl: string }): Mail {
  const lines = [
    `Door Money refunded ${money(params.refundedCents)} on ${params.what} for ${params.actName}.`,
    params.full
      ? `That is the whole amount. It goes back to the card it was paid with, and takes five to ten business days depending on the bank.`
      : `It goes back to the card it was paid with, and takes five to ten business days depending on the bank. The rest paid for the weeks the run played.`,
    `The record of the run: ${params.recordUrl}`,
  ];
  const html = shell([
    `Door Money refunded <b style="color:${BLUE}">${money(params.refundedCents)}</b> on ${escape(params.what)} for ${escape(params.actName)}.`,
    escape(lines[1]),
    `The <a href="${escape(params.recordUrl)}" style="color:${BLUE}">record of the run</a>`,
  ]);
  return { to: params.to, subject: `${money(params.refundedCents)} went back`, text: lines.join("\n\n"), html };
}

/** To Door Money, when the Friday run could not send something. Nobody else gets this one. */
export function payoutProblem(params: { to: string; ranOn: string; failures: { payoutId: string; message: string }[]; adminUrl: string }): Mail {
  const n = params.failures.length;
  const head = `${n} ${n === 1 ? "transfer" : "transfers"} failed in the payout run on ${params.ranOn}.`;
  const detail = params.failures.map((f) => `${f.payoutId}: ${f.message}`);
  const lines = [
    head,
    `The rows are still scheduled, so the next run tries them again. A transfer that keeps failing usually means the act's Stripe account cannot receive yet.`,
    ...detail,
    params.adminUrl,
  ];
  const html = shell([
    `<b style="color:${BLUE}">${escape(head)}</b>`,
    escape(lines[1]),
    `<span style="font-family:'Courier New',monospace;font-size:13px">${detail.map(escape).join("<br />")}</span>`,
    `<a href="${escape(params.adminUrl)}" style="color:${BLUE}">${escape(params.adminUrl)}</a>`,
  ]);
  return { to: params.to, subject: `Payout run ${params.ranOn}: ${n} ${n === 1 ? "failure" : "failures"}`, text: lines.join("\n\n"), html };
}
