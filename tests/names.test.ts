/*
  The account holder's name, in two parts.

  profiles.display_name was one field whose hint said "a person or a business". It is now first and
  last, because whoever holds an account is a person: a band's name is on the act and a business's
  name is on the patron row, and those are what a board and a receipt show.

  Older rows can carry only a first name, from a display_name that was a single word, so every
  reader has to survive a missing half.
*/
import assert from "node:assert/strict";
import { test } from "node:test";
import { fullName } from "@/lib/names";
import { newBoardsEmail, newsletterWelcome } from "@/lib/email";

test("both names join into one", () => {
  assert.equal(fullName({ first_name: "Dana", last_name: "Whitfield" }), "Dana Whitfield");
});

test("a first name on its own is the whole name", () => {
  assert.equal(fullName({ first_name: "Prince", last_name: null }), "Prince");
});

test("a last name on its own still reads", () => {
  assert.equal(fullName({ first_name: null, last_name: "Whitfield" }), "Whitfield");
});

test("no name at all is null, not an empty string, so the caller picks the words", () => {
  assert.equal(fullName({ first_name: null, last_name: null }), null);
  assert.equal(fullName(null), null);
  assert.equal(fullName(undefined), null);
});

test("whitespace is not a name", () => {
  assert.equal(fullName({ first_name: "   ", last_name: "  " }), null);
});

const BOARDS = [{ actName: "Gutter Hymns", city: "New York", runTitle: "Fall run", showCount: 18, dates: "Oct 3 to Nov 2", openSpots: 4, fromCents: 12000, boardUrl: "https://example.test/gutter-hymns/support-fall-run" }];

test("the new-boards email opens with the name the list holds", () => {
  const mail = newBoardsEmail({ to: "d@example.test", firstName: "Dana", boards: BOARDS, unsubscribeUrl: "https://example.test/u" });
  assert.match(mail.text, /^Dana,/);
  assert.match(mail.html, /Dana,/);
});

test("an address collected before names were asked for gets no greeting, not a fake one", () => {
  for (const firstName of [null, undefined, "   "]) {
    const mail = newBoardsEmail({ to: "d@example.test", firstName, boards: BOARDS, unsubscribeUrl: "https://example.test/u" });
    assert.doesNotMatch(mail.text, /^\s*,/, "no empty greeting");
    assert.doesNotMatch(mail.text, /there,|Hi,/i, "no placeholder greeting");
    assert.match(mail.text, /^Gutter Hymns opened a fundraiser/);
  }
});

test("the welcome email greets by name and still reads without one", () => {
  const named = newsletterWelcome({ to: "d@example.test", firstName: "Dana", unsubscribeUrl: "https://example.test/u" });
  assert.match(named.text, /^Dana,/);
  // The body has to survive the greeting being dropped: the lines are indexed, not just joined.
  const plain = newsletterWelcome({ to: "d@example.test", unsubscribeUrl: "https://example.test/u" });
  assert.match(plain.text, /^This address is on the/);
  for (const mail of [named, plain]) {
    assert.match(mail.html, /new-fundraisers email/);
    assert.match(mail.html, /New musicians open fundraisers/);
    assert.match(mail.html, /Nothing to do now/);
  }
});
