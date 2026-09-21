/*
  What a sponsor sends and an organizer accepts, in words.

  Music sends a logo and its words do not move: a test pins each one to the string the page and the
  mail used before this file existed. Every other category sends materials, which may be one line
  of text, and is never told to find a logo, never called a musician, and never told that having
  its materials accepted means anything was delivered.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { markApproved, markDeclined } from "@/lib/email";
import { decisionWords, materialsOutcome, materialsRules, materialsStrap, materialsWords } from "@/lib/materials-words";

const whole = (m: { subject: string; text: string; html: string }) => `${m.subject}\n${m.text}\n${m.html}`;
const approved = { to: "s@example.com", patronName: "Kettle St. Coffee", actName: "Second Stage", lotName: "Curtain speech", recordUrl: "https://x.example/record/1" };
const declined = { to: "s@example.com", patronName: "Kettle St. Coffee", actName: "Second Stage", lotName: "Curtain speech", refundedCents: 25000, boardsUrl: "https://x.example/auctions" };

test("music's words are exactly the ones the page and the form already used", () => {
  const w = materialsWords("music", "tour");
  assert.deepEqual(
    [w.noun, w.title, w.pageTitle, w.sendButton, w.resendButton, w.replaceLabel, w.whatToSend, w.emptyError],
    ["logo", "The logo", "Send the logo", "Send the logo", "Send the new logo", "Replace the logo", "A logo, a name, or both", "Add a logo file, a name, or both."],
  );
  assert.equal(w.fileHelp, "PNG, JPG or WebP, under 5MB. A PNG with a transparent background prints and screens best.");
  assert.equal(w.nameHelp, "Used where a logo will not fit: a thank-you post, a merch table card, a program credit.");
  assert.equal(materialsWords(null, "season").noun, "logo", "a sponsorship from before categories is music");
  assert.equal(materialsStrap(w, { status: "none", fundraiserStatus: "open", organizerName: "Gutter Hymns" }), "Gutter Hymns is waiting for the logo");
  assert.equal(materialsStrap(w, { status: "approved", fundraiserStatus: "open", organizerName: "Gutter Hymns" }), "The logo is approved");
  assert.equal(materialsStrap(w, { status: "none", fundraiserStatus: "cancelled", organizerName: "Gutter Hymns" }), "The tour was cancelled");
  assert.equal(materialsOutcome(w, { status: "approved", organizerName: "Gutter Hymns", what: "kick drum head" }), "The logo goes on the kick drum head for the whole tour. Changing it now goes through Door Money.");
  assert.deepEqual(materialsRules(w, "Gutter Hymns"), [
    "The logo is the patron's own name or image, or one the patron has the right to use.",
    "Gutter Hymns approves or declines it. Nothing goes up without their yes.",
    "A declined logo means the sponsorship never runs, and the money goes back in full.",
    "An approved logo stays where it goes for the whole tour.",
  ]);
});

test("nobody outside music is asked for a logo, and a line of text is enough", () => {
  for (const category of ["theater", "film", "sports", "dance"]) {
    const w = materialsWords(category);
    const everything = [
      ...Object.values(w).filter((v): v is string => typeof v === "string"),
      materialsStrap(w, { status: "none", fundraiserStatus: "open", organizerName: "Second Stage" }),
      materialsStrap(w, { status: "approved", fundraiserStatus: "open", organizerName: "Second Stage" }),
      materialsStrap(w, { status: "declined", fundraiserStatus: "open", organizerName: "Second Stage" }),
      materialsOutcome(w, { status: "approved", organizerName: "Second Stage", what: "curtain speech" }),
      materialsOutcome(w, { status: "declined", organizerName: "Second Stage", what: "curtain speech" }),
      ...materialsRules(w, "Second Stage"),
      ...Object.values(decisionWords(w)),
    ].join("\n");
    // "logo" survives in exactly one place: the file box says a logo may go there, where one is used.
    assert.doesNotMatch(everything.replace(w.fileHelp, ""), /logo/i, category);
    assert.doesNotMatch(everything, /musician|\bband\b|\btour\b|\bshows?\b|—/i, category);
    assert.equal(w.noun, "materials");
    assert.match(w.nameHelp, /For a credit or a spoken mention this is all that is needed/);
    assert.match(w.fileHelp, /^Optional\./, "the file is optional: a curtain speech has none");
  }
  assert.equal(materialsWords("theater").organizer, "theater company");
  assert.equal(materialsWords("dance").organizer, "organizer");
});

test("accepting materials is never said to be delivery", () => {
  const w = materialsWords("theater");
  assert.match(materialsOutcome(w, { status: "approved", organizerName: "Second Stage", what: "curtain speech" }), /Accepting it is not delivery: Door Money holds the money until Second Stage documents that it was delivered/);
  assert.match(materialsRules(w, "Second Stage")[3], /Accepting it is not delivery/);
  assert.match(decisionWords(w).declineWarning, /Accepting says you can deliver this/);
  const mail = markApproved({ ...approved, categoryKey: "theater" });
  assert.match(mail.text, /Door Money holds the money until Second Stage documents that the curtain speech was delivered/);
  assert.doesNotMatch(whole(mail), /verified|confirmed|certif|inspected/i);
});

test("the two decision emails are word for word what they were for music", () => {
  for (const make of [() => [markApproved(approved), markApproved({ ...approved, categoryKey: "music" }), markApproved({ ...approved, categoryKey: null })],
                      () => [markDeclined(declined), markDeclined({ ...declined, categoryKey: "music" }), markDeclined({ ...declined, categoryKey: null })]]) {
    const [absent, music, nothing] = make();
    assert.deepEqual(music, absent);
    assert.deepEqual(nothing, absent);
  }
  assert.equal(markApproved(approved).subject, "Second Stage approved the logo");
  assert.match(markApproved(approved).text, /It stays on the curtain speech for the whole fundraiser\. Nothing else is needed\./);
  assert.equal(markDeclined(declined).subject, "Second Stage declined the logo, and the money went back");
  assert.match(markDeclined(declined).text, /Every musician keeps the final say/);
});

test("outside music the same two emails have no logo, no musician and no shows in them", () => {
  for (const category of ["theater", "film", "sports"]) {
    const yes = markApproved({ ...approved, categoryKey: category });
    const no = markDeclined({ ...declined, categoryKey: category });
    assert.doesNotMatch(whole(yes) + whole(no), /logo|musician|the shows|the rooms|—/i, category);
    assert.equal(yes.subject, "Second Stage accepted your materials");
    assert.equal(no.subject, "Second Stage declined your materials, and the money went back");
    assert.match(no.text, /\$250 goes back to the card it was paid with/, "the refund is said the same way, to the cent");
    assert.match(no.text, /Every organizer keeps the final say/);
  }
});
