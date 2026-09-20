/**
 * The words on a record and in a transactional email, by category.
 *
 * Music keeps every word it has: "the logo", "the tour", "18 shows". Those are right for music and
 * sent in mail people already received. Everywhere else the same sentences were wrong in two ways:
 * they called every organizer a musician, and they called whatever the sponsor has to send "the
 * logo", which for a program credit is a line of text and for a curtain speech is a name said
 * aloud. Outside music the words are the neutral ones from CLAUDE.md: organizer (or the category's
 * own noun), sponsorship, materials, fundraiser.
 *
 * Pure, and importable from a client component.
 */
import { organizerNoun } from "@/lib/categories";
import { periodOf } from "@/lib/periods";

export type RecordWords = {
  music: boolean;
  /** "tour", "season", or "fundraiser". */
  periodNoun: string;
  /** "musician", "team", "filmmaker", "theater company", or "organizer". */
  organizer: string;
  /** What the sponsor sends: "logo" for music, "materials" elsewhere. */
  materials: string;
  /** "Send the logo" / "Send the materials". */
  sendLabel: string;
  replaceLabel: string;
};

export function recordWords(categoryKey: string | null | undefined, kind: string | null | undefined): RecordWords {
  const music = (categoryKey ?? "music") === "music";
  const materials = music ? "logo" : "materials";
  return {
    music,
    periodNoun: music ? periodOf(kind).noun : "fundraiser",
    organizer: music ? "musician" : organizerNoun(categoryKey),
    materials,
    sendLabel: `Send the ${materials}`,
    replaceLabel: `Replace the ${materials}`,
  };
}

/** The line under the record's title. */
export function recordStrap(w: RecordWords, status: string): string {
  if (status === "cancelled") return `The ${w.periodNoun} was cancelled`;
  if (status === "closed") return `The ${w.periodNoun} is over`;
  if (w.music) return status === "live" ? `The ${w.periodNoun} is on` : `The ${w.periodNoun} has not started`;
  return "The fundraiser is open";
}

/** The prompt shown while the sponsor's materials are still owed or still unanswered. */
export function materialsPrompt(w: RecordWords, p: { status: "none" | "submitted"; organizerName: string; what: string }): { eyebrow: string; heading: string; body: string } {
  if (w.music) {
    return p.status === "none"
      ? { eyebrow: "Still to send", heading: `${p.organizerName} is waiting for the logo`, body: `The logo is the name or image as it will appear on ${p.what}. Nothing goes up without ${p.organizerName}'s yes, and nothing runs until it is in.` }
      : { eyebrow: "With the musician", heading: `${p.organizerName} has the logo`, body: `${p.organizerName} approves or declines it, and Door Money sends an email either way. It can still be replaced until they decide.` };
  }
  return p.status === "none"
    ? { eyebrow: "Still to send", heading: `${p.organizerName} is waiting for your materials`, body: `That is whatever ${p.what} needs: a name as it should read, a credit line, artwork. ${p.organizerName} accepts or declines it, and Door Money holds the money either way.` }
    : { eyebrow: `With the ${w.organizer}`, heading: `${p.organizerName} has your materials`, body: `${p.organizerName} accepts or declines them, and Door Money sends an email either way. They can still be replaced until then.` };
}

/** How the release is described on a record. Says who documents delivery, and that Door Money does not judge it. */
export function releaseSentence(w: RecordWords, organizerName: string): string {
  return w.music
    ? `Door Money holds the money and pays ${organizerName} weekly through the ${w.periodNoun}.`
    : `Door Money holds the money and releases ${organizerName}'s share as ${organizerName} documents each deliverable. Documentation comes from ${organizerName}, and Door Money passes it on.`;
}
