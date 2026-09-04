/*
  Renders every transactional email with sample data, so they can be read without sending any.

    npx tsx scripts/preview-emails.ts        writes .tmp/emails/*.html and an index
    npx tsx scripts/preview-emails.ts --list prints the subject lines only

  Nothing here touches the database or Resend. The sample data is deliberately ordinary: a real
  act, a real business, amounts in the range these actually run at.
*/
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  auctionUnsold,
  auctionWon,
  backingNotice,
  backingReceipt,
  cancellationNotice,
  closingSoon,
  contactNotification,
  flagConfirmation,
  flagRaised,
  markApproved,
  markDeclined,
  markReminder,
  markWaiting,
  newBoardsEmail,
  newsletterWelcome,
  outbidNotice,
  payoutNotice,
  payoutProblem,
  payoutsOn,
  purchaseReceipt,
  recordReady,
  refundIssued,
  saleNotice,
  spotTaken,
  weeklyDigest,
  type Mail,
} from "@/lib/email";
import { SITE } from "@/lib/site";

const to = "patron@example.com";
const act = "Gutter Hymns";
const run = "Fall run";
const lot = "Kick drum head";
const patron = "Kettle St. Coffee";
const board = `${SITE.url}/board/gutter-hymns`;
const record = `${SITE.url}/record/00000000-0000-0000-0000-000000000001`;
const dash = `${SITE.url}/dashboard`;

/* Every template, grouped the way the run itself unfolds. */
const EMAILS: [string, Mail][] = [
  // Buying
  ["purchase-receipt", purchaseReceipt({ to, patronName: patron, lotName: lot, actName: act, runTitle: run, amountCents: 120000, boardUrl: board, recordUrl: record })],
  ["sale-notice", saleNotice({ to, actName: act, lotName: lot, patronName: patron, amountCents: 120000, netCents: 102000, boardUrl: board, dashboardUrl: dash })],
  ["backing-receipt", backingReceipt({ to, displayName: "Ada R.", actName: act, runTitle: run, place: "the tour thank-you", amountCents: 2500, boardUrl: board, recordUrl: record })],
  ["backing-notice", backingNotice({ to, actName: act, displayName: "Ada R.", place: "the tour thank-you", amountCents: 2500, netCents: 2125, dashboardUrl: dash })],

  // The mark
  ["mark-waiting", markWaiting({ to, actName: act, patronName: patron, lotName: lot, note: "The white version on anything dark. No tagline.", dashboardUrl: dash })],
  ["mark-reminder", markReminder({ to, patronName: patron, actName: act, lotName: lot, runTitle: run, markUrl: `${SITE.url}/mark/00000000-0000-0000-0000-000000000001` })],
  ["mark-approved", markApproved({ to, patronName: patron, actName: act, lotName: lot, recordUrl: record })],
  ["mark-declined", markDeclined({ to, patronName: patron, actName: act, lotName: lot, refundedCents: 120000, boardsUrl: `${SITE.url}/auctions` })],

  // Auctions
  ["outbid", outbidNotice({ to, patronName: patron, actName: act, lotName: lot, yourCents: 52000, topCents: 55000, minimumCents: 60000, closesAt: new Date("2026-09-25T23:00:00-04:00"), boardUrl: board })],
  ["closing-soon", closingSoon({ to, patronName: patron, actName: act, lotName: lot, topCents: 55000, leading: false, minimumCents: 60000, closesAt: new Date("2026-09-25T23:00:00-04:00"), boardUrl: board })],
  ["auction-won", auctionWon({ to, patronName: patron, actName: act, runTitle: run, lotName: lot, amountCents: 55000, hours: 48, deadline: new Date("2026-09-27T23:00:00-04:00"), payUrl: `${SITE.url}/claim/sample` })],
  ["spot-taken", spotTaken({ to, patronName: patron, actName: act, lotName: lot, yourCents: 52000, takenAtCents: 90000, boardUrl: board })],
  ["auction-unsold", auctionUnsold({ to, actName: act, lotName: lot, reserveCents: 45000, dashboardUrl: dash })],

  // Money moving
  ["payouts-on", payoutsOn({ to, actName: act, dashboardUrl: `${SITE.url}/dashboard/payouts` })],
  ["payout-notice", payoutNotice({ to, actName: act, amountCents: 34000, sliceCount: 3, dashboardUrl: `${SITE.url}/dashboard/payouts` })],
  ["refund-issued", refundIssued({ to, patronName: patron, actName: act, what: `the ${lot.toLowerCase()}`, refundedCents: 60000, full: false, recordUrl: record })],
  ["cancellation", cancellationNotice({ to, patronName: patron, actName: act, runTitle: run, lotName: lot, refundedCents: 90000, amountCents: 120000, recordUrl: record })],
  ["record-ready", recordReady({ to, patronName: patron, actName: act, runTitle: run, lotName: lot, playedCount: 17, showCount: 18, recordUrl: record })],

  // Something is wrong
  ["flag-raised", flagRaised({ to, patronName: patron, what: `the ${lot.toLowerCase()}`, actName: act, runTitle: run, note: "Three shows in a row cancelled with no word.", pausedCount: 2, adminUrl: `${SITE.url}/admin`, recordUrl: record })],
  ["flag-confirmation", flagConfirmation({ to, patronName: patron, what: `the ${lot.toLowerCase()}`, actName: act, runTitle: run, pausedCount: 2, recordUrl: record })],
  ["payout-problem", payoutProblem({ to, ranOn: "2026-09-11", failures: [{ payoutId: "b2c3d4e5", message: "No such destination: acct_1Example" }], adminUrl: `${SITE.url}/admin` })],

  // The list, and the desk
  ["newsletter-welcome", newsletterWelcome({ to, unsubscribeUrl: `${SITE.url}/newsletter/unsubscribe?t=sample` })],
  [
    "new-boards",
    newBoardsEmail({
      to,
      boards: [
        { actName: act, city: "New York", runTitle: run, dates: "Oct 3 to Nov 2", showCount: 18, openSpots: 7, fromCents: 15000, boardUrl: board },
        { actName: "Rosie the Bassoonist", city: "New York", runTitle: "Fall season", dates: "Sep 15 to Dec 20", showCount: 32, openSpots: 6, fromCents: 3000, boardUrl: `${SITE.url}/board/rosie-bassoon` },
      ],
      unsubscribeUrl: `${SITE.url}/newsletter/unsubscribe?t=sample`,
    }),
  ],
  [
    "weekly-digest",
    weeklyDigest({
      to,
      n: {
        from: "September 5",
        to: "September 11",
        boardsOpened: 2,
        spotsSold: 4,
        soldCents: 214000,
        backings: 9,
        backedCents: 32500,
        paidOutCents: 78000,
        heldCents: 486000,
        openFlags: 1,
        newSubscribers: 34,
        newNotes: 3,
        actsTotal: 12,
        boardsLive: 5,
      },
      adminUrl: `${SITE.url}/admin`,
    }),
  ],
  [
    "contact-note",
    contactNotification({ to, reason: "Listing an act", name: "Jo Mercer", organization: "Gutter Hymns", email: "jo@example.com", subject: "Residency at Barbès", message: "We play the first Sunday of every month and would like a board.", createdAt: new Date("2026-09-11T19:30:00Z") }),
  ],
];

if (process.argv.includes("--list")) {
  for (const [name, mail] of EMAILS) console.log(`${name.padEnd(20)} ${mail.subject}`);
} else {
  const dir = path.join(process.cwd(), ".tmp", "emails");
  mkdirSync(dir, { recursive: true });
  for (const [name, mail] of EMAILS) writeFileSync(path.join(dir, `${name}.html`), mail.html);
  const index = `<!doctype html><meta charset="utf-8"><title>Door Money email</title>
<style>body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#f4f0e8;margin:0;padding:32px}h1{font-weight:400;letter-spacing:.04em;text-transform:uppercase}a{color:#8296ff}li{margin:.4em 0}code{color:#9aa5c4}</style>
<h1>Door Money email</h1><ol>${EMAILS.map(([n, m]) => `<li><a href="${n}.html">${n}</a> <code>${m.subject.replace(/</g, "&lt;")}</code></li>`).join("")}</ol>`;
  writeFileSync(path.join(dir, "index.html"), index);
  console.log(`${EMAILS.length} emails written to ${dir}`);
  console.log(`open ${path.join(dir, "index.html")}`);
}
