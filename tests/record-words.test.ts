/*
  The words on a record and in the purchase-path emails, by category.

  Two promises. Music's words do not move: they are right for music and they are in mail people
  already have. And no other category is called a musician, told about shows, or asked for a logo
  when what it owes is a credit line or a name to be said aloud.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { markReminder, purchaseReceipt, saleNotice } from "@/lib/email";
import { materialsPrompt, recordStrap, recordWords, releaseSentence } from "@/lib/record-words";

const receipt = { to: "s@example.com", patronName: "Kettle St. Coffee", lotName: "Program credit", actName: "Second Stage", runTitle: "Winter production", amountCents: 50000, boardUrl: "https://x.example/b", recordUrl: "https://x.example/record/1" };
const sale = { to: "o@example.com", actName: "Second Stage", lotName: "Program credit", patronName: "Kettle St. Coffee", amountCents: 50000, netCents: 42500, boardUrl: "https://x.example/b", dashboardUrl: "https://x.example/dashboard" };
const reminder = { to: "s@example.com", patronName: "Kettle St. Coffee", actName: "Second Stage", lotName: "Program credit", runTitle: "Winter production", markUrl: "https://x.example/mark/1" };
const whole = (m: { subject: string; text: string; html: string }) => `${m.subject}\n${m.text}\n${m.html}`;

test("music's mail is word for word what it was, with or without a category", () => {
  for (const make of [() => [purchaseReceipt(receipt), purchaseReceipt({ ...receipt, categoryKey: "music" }), purchaseReceipt({ ...receipt, categoryKey: null })],
                      () => [saleNotice(sale), saleNotice({ ...sale, categoryKey: "music" }), saleNotice({ ...sale, categoryKey: null })],
                      () => [markReminder(reminder), markReminder({ ...reminder, categoryKey: "music" }), markReminder({ ...reminder, categoryKey: null })]]) {
    const [absent, music, nothing] = make();
    assert.deepEqual(music, absent);
    assert.deepEqual(nothing, absent);
  }
  assert.match(purchaseReceipt(receipt).text, /pays Second Stage every Friday through the fundraiser/);
  assert.match(purchaseReceipt(receipt).text, /approves the logo before it goes on anything/);
  assert.match(saleNotice(sale).text, /in weekly slices, every Friday/);
  assert.equal(markReminder(reminder).subject, "The program credit is paid for. The logo is still to come.");
});

test("outside music nobody is promised a Friday, told about shows, or asked for a logo", () => {
  for (const category of ["theater", "film", "sports", "dance"]) {
    const mails = [purchaseReceipt({ ...receipt, categoryKey: category }), saleNotice({ ...sale, categoryKey: category }), markReminder({ ...reminder, categoryKey: category })];
    for (const m of mails) {
      assert.doesNotMatch(whole(m), /logo|the shows|the rooms|weekly slices|every Friday|musician|—/i, `${category}: ${m.subject}`);
    }
    assert.match(mails[0].text, /releases Second Stage's share as Second Stage documents what was delivered/);
    assert.match(mails[0].text, /accepts the sponsor's materials before anything goes up/);
    assert.match(mails[1].text, /\$425 reaches Second Stage as each deliverable is documented/);
    assert.match(mails[1].text, /Door Money keeps 15%/, "the fee is said, and is what it was");
    assert.equal(mails[2].subject, "The program credit is paid for. The materials are still to come.");
    assert.match(mails[2].html, /send the materials/);
  }
});

test("no mail says Door Money checked anything", () => {
  for (const category of [undefined, "theater"]) {
    const text = whole(purchaseReceipt({ ...receipt, categoryKey: category })) + whole(saleNotice({ ...sale, categoryKey: category }));
    assert.doesNotMatch(text, /verified|confirmed|certif|inspected|guarantee/i);
  }
});

test("a record speaks music's words for music and neutral ones for everybody else", () => {
  const tour = recordWords("music", "tour");
  assert.deepEqual([tour.music, tour.periodNoun, tour.organizer, tour.materials, tour.sendLabel], [true, "tour", "musician", "logo", "Send the logo"]);
  assert.deepEqual(recordWords(null, "season").periodNoun, "season", "a record from before categories is music");
  const play = recordWords("theater", null);
  assert.deepEqual([play.music, play.periodNoun, play.organizer, play.materials, play.sendLabel, play.replaceLabel], [false, "fundraiser", "theater company", "materials", "Send the materials", "Replace the materials"]);
  assert.equal(recordWords("dance", null).organizer, "organizer", "a category with no words of its own is an organizer, never a musician");
});

test("the strap and the materials prompt follow the category", () => {
  assert.equal(recordStrap(recordWords("music", "tour"), "live"), "The tour is on");
  assert.equal(recordStrap(recordWords("music", "tour"), "open"), "The tour has not started");
  assert.equal(recordStrap(recordWords("film", null), "open"), "The fundraiser is open", "a film has no start to have not reached");
  assert.equal(recordStrap(recordWords("film", null), "cancelled"), "The fundraiser was cancelled");

  const musicPrompt = materialsPrompt(recordWords("music", "tour"), { status: "none", organizerName: "Gutter Hymns", what: "the kick drum head" });
  assert.equal(musicPrompt.heading, "Gutter Hymns is waiting for the logo");
  const theaterPrompt = materialsPrompt(recordWords("theater", null), { status: "none", organizerName: "Second Stage", what: "the program credit" });
  assert.equal(theaterPrompt.heading, "Second Stage is waiting for your materials");
  assert.doesNotMatch(JSON.stringify(theaterPrompt) + JSON.stringify(materialsPrompt(recordWords("theater", null), { status: "submitted", organizerName: "Second Stage", what: "the program credit" })), /logo|musician/i);
});

test("the release sentence says who documents delivery, and that Door Money passes it on", () => {
  assert.equal(releaseSentence(recordWords("music", "tour"), "Gutter Hymns"), "Door Money holds the money and pays Gutter Hymns weekly through the tour.");
  const s = releaseSentence(recordWords("theater", null), "Second Stage");
  assert.match(s, /as Second Stage documents each deliverable/);
  assert.match(s, /Documentation comes from Second Stage, and Door Money passes it on/);
  assert.doesNotMatch(s, /verif|confirm|weekly|Friday/i);
});
