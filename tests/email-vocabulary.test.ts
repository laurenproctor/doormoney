/*
  The words the transactional mail is allowed to use.

  Email is the one surface Door Money cannot correct after the fact: a receipt is in somebody's
  inbox for good. Decision 14 retired a handful of words, and the conversion happened once, by
  hand, across twenty-five templates. This holds the line so the twenty-sixth does not reintroduce
  them.

  Subject, plain text and HTML are all checked, because a subject line is the part most likely to
  be written in a hurry.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auctionUnsold,
  auctionWon,
  backingNotice,
  backingReceipt,
  cancellationNotice,
  closingSoon,
  markApproved,
  markDeclined,
  markReminder,
  markWaiting,
  newBoardsEmail,
  newsletterWelcome,
  outbidNotice,
  payoutNotice,
  payoutsOn,
  purchaseReceipt,
  recordReady,
  refundIssued,
  saleNotice,
  spotTaken,
} from "@/lib/email";

const to = "patron@example.test";
const urls = {
  boardUrl: "https://example.test/gutter-hymns/support-fall-tour",
  recordUrl: "https://example.test/record/1",
  dashboardUrl: "https://example.test/dashboard",
};
const common = { to, patronName: "Kettle St. Coffee", actName: "Gutter Hymns", runTitle: "Fall tour", lotName: "Kick drum head" };
const soon = new Date("2027-10-03T20:00:00Z");

/** Every template a patron or a musician can receive, rendered with ordinary arguments. */
const MAILS = [
  purchaseReceipt({ ...common, amountCents: 120000, ...urls }),
  saleNotice({ ...common, amountCents: 120000, netCents: 102000, ...urls }),
  payoutNotice({ to, actName: common.actName, amountCents: 51000, sliceCount: 3, dashboardUrl: urls.dashboardUrl }),
  payoutNotice({ to, actName: common.actName, amountCents: 51000, sliceCount: 1, dashboardUrl: urls.dashboardUrl }),
  cancellationNotice({ ...common, refundedCents: 60000, amountCents: 120000, recordUrl: urls.recordUrl }),
  cancellationNotice({ ...common, refundedCents: 120000, amountCents: 120000, recordUrl: urls.recordUrl }),
  recordReady({ ...common, playedCount: 11, showCount: 12, recordUrl: urls.recordUrl }),
  backingReceipt({ to, displayName: "Dana", actName: common.actName, runTitle: common.runTitle, place: "the tour thank-you", amountCents: 2500, boardUrl: urls.boardUrl, recordUrl: urls.recordUrl }),
  backingNotice({ to, actName: common.actName, displayName: "Dana", place: "the merch table card", amountCents: 2500, netCents: 2125, dashboardUrl: urls.dashboardUrl }),
  outbidNotice({ ...common, yourCents: 50000, topCents: 60000, minimumCents: 63000, closesAt: soon, boardUrl: urls.boardUrl }),
  closingSoon({ ...common, topCents: 60000, leading: true, minimumCents: 63000, closesAt: soon, boardUrl: urls.boardUrl }),
  closingSoon({ ...common, topCents: 60000, leading: false, minimumCents: 63000, closesAt: soon, boardUrl: urls.boardUrl }),
  auctionWon({ ...common, amountCents: 60000, hours: 48, deadline: soon, payUrl: "https://example.test/claim/x" }),
  spotTaken({ ...common, yourCents: 50000, takenAtCents: 90000, boardUrl: urls.boardUrl }),
  auctionUnsold({ to, actName: common.actName, lotName: common.lotName, reserveCents: 45000, dashboardUrl: urls.dashboardUrl }),
  markWaiting({ to, actName: common.actName, patronName: common.patronName, lotName: common.lotName, note: "Logo attached.", dashboardUrl: urls.dashboardUrl }),
  markApproved({ ...common, recordUrl: urls.recordUrl }),
  markDeclined({ ...common, refundedCents: 120000, boardsUrl: "https://example.test/auctions" }),
  markReminder({ ...common, markUrl: "https://example.test/mark/1" }),
  payoutsOn({ to, actName: common.actName, dashboardUrl: urls.dashboardUrl }),
  refundIssued({ ...common, what: "the kick drum head", refundedCents: 60000, full: false, recordUrl: urls.recordUrl }),
  newsletterWelcome({ to, firstName: "Dana", unsubscribeUrl: "https://example.test/u" }),
  newBoardsEmail({
    to,
    firstName: "Dana",
    boards: [{ actName: "Gutter Hymns", city: "New York", runTitle: "Fall tour", showCount: 12, dates: "Oct 3 to Nov 2", openSpots: 4, fromCents: 30000, boardUrl: urls.boardUrl }],
    unsubscribeUrl: "https://example.test/u",
  }),
];

/** Words decision 14 retired. "Run" is absent on purpose: it is still an ordinary verb. */
const RETIRED = [/\bboards?\b/i, /\bcampaigns?\b/i, /\bsupporters?\b/i, /\bthe marks?\b/i, /standard card/i];

test("every template renders", () => {
  assert.equal(MAILS.length, 23);
  for (const mail of MAILS) {
    assert.ok(mail.subject.length > 0, "a subject");
    assert.ok(mail.text.length > 0, "some text");
    assert.ok(mail.html.includes("Door Money"), "the letterhead");
  }
});

test("no retired word reaches a subject line", () => {
  for (const mail of MAILS) {
    for (const word of RETIRED) {
      assert.doesNotMatch(mail.subject, word, `subject: ${mail.subject}`);
    }
  }
});

test("no retired word reaches the body, in either format", () => {
  for (const mail of MAILS) {
    for (const word of RETIRED) {
      assert.doesNotMatch(mail.text, word, `text of: ${mail.subject}`);
      assert.doesNotMatch(mail.html, word, `html of: ${mail.subject}`);
    }
  }
});

test("the words that replaced them are actually in use", () => {
  const all = MAILS.map((m) => `${m.subject}\n${m.text}`).join("\n");
  for (const word of ["fundraiser", "sponsorship", "logo", "musician"]) {
    assert.match(all, new RegExp(word, "i"), `${word} should appear somewhere`);
  }
});
