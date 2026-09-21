/**
 * The words for what a sponsor sends and an organizer accepts.
 *
 * In music that is a logo, and music's words stay exactly what they are: they are accurate, and
 * they are in mail and on pages people have already seen. Everywhere else it is "materials": a
 * credit line as it should read, a name to be said from a stage, artwork for a banner. Calling all
 * of that a logo told a sponsor buying a curtain speech to go and find an image file.
 *
 * The column is still `purchases.mark_status`, and it has always meant one thing: did the
 * organizer accept what the sponsor sent. Accepting is not delivery and releases nothing by itself
 * (docs/DELIVERY_POLICY_MATRIX.md). Only the words differ by category, and they differ here and
 * nowhere else.
 *
 * Pure, and importable from a client component.
 */
import { categoryWords } from "@/lib/category-words";

export type MaterialsWords = {
  music: boolean;
  /** "logo" or "materials". */
  noun: string;
  /** "The logo" / "Your materials", for an eyebrow or a field label. */
  title: string;
  /** "musician", "team", "filmmaker", "theater company", "organizer". */
  organizer: string;
  /** "tour", "season", "fundraiser". */
  fundraiser: string;
  pageTitle: string;
  sendButton: string;
  resendButton: string;
  replaceLabel: string;
  /** What to send, as a heading. */
  whatToSend: string;
  fileHelp: string;
  nameHelp: string;
  notePlaceholder: string;
  emptyError: string;
};

export function materialsWords(categoryKey: string | null | undefined, kind?: string | null): MaterialsWords {
  const words = categoryWords(categoryKey, kind);
  const music = (categoryKey ?? "music") === "music";
  if (music) {
    return {
      music, noun: "logo", title: "The logo", organizer: words.organizer, fundraiser: words.fundraiser,
      pageTitle: "Send the logo",
      sendButton: "Send the logo", resendButton: "Send the new logo", replaceLabel: "Replace the logo",
      whatToSend: "A logo, a name, or both",
      fileHelp: "PNG, JPG or WebP, under 5MB. A PNG with a transparent background prints and screens best.",
      nameHelp: "Used where a logo will not fit: a thank-you post, a merch table card, a program credit.",
      notePlaceholder: "The white version on anything dark. No tagline.",
      emptyError: "Add a logo file, a name, or both.",
    };
  }
  return {
    music, noun: "materials", title: "Your materials", organizer: words.organizer, fundraiser: words.fundraiser,
    pageTitle: "Send your materials",
    sendButton: "Send the materials", resendButton: "Send the new materials", replaceLabel: "Replace the file",
    whatToSend: "The wording, a file, or both",
    fileHelp: "Optional. Artwork or a logo where the sponsorship uses one. PNG, JPG or WebP, under 5MB.",
    nameHelp: "The name or the line exactly as it should be printed, shown or said. For a credit or a spoken mention this is all that is needed.",
    notePlaceholder: "How the name is pronounced. What may and may not be shown.",
    emptyError: "Add the wording, a file, or both.",
  };
}

/** The line under the title on the sponsor's page. */
export function materialsStrap(w: MaterialsWords, p: { status: string; fundraiserStatus: string; organizerName: string }): string {
  if (p.status === "approved") return w.music ? "The logo is approved" : "Your materials are accepted";
  if (p.status === "declined") return w.music ? "The logo was declined" : "Your materials were declined";
  if (p.fundraiserStatus === "cancelled") return `The ${w.fundraiser} was cancelled`;
  if (p.status === "submitted") return `Waiting on ${p.organizerName}`;
  return w.music ? `${p.organizerName} is waiting for the logo` : `${p.organizerName} is waiting for your materials`;
}

/** Where a decided sponsorship stands, on the sponsor's page. */
export function materialsOutcome(w: MaterialsWords, p: { status: string; organizerName: string; what: string }): string {
  if (p.status === "approved") {
    return w.music
      ? `The logo goes on the ${p.what} for the whole ${w.fundraiser}. Changing it now goes through Door Money.`
      : `${p.organizerName} accepted what you sent for the ${p.what}. Accepting it is not delivery: Door Money holds the money until ${p.organizerName} documents that it was delivered. Changing it now goes through Door Money.`;
  }
  if (p.status === "declined") {
    return w.music
      ? `${p.organizerName} declined the logo, so the sponsorship never runs and the money went back to the card it came from.`
      : `${p.organizerName} declined what you sent, so the sponsorship never runs and the money went back to the card it came from.`;
  }
  return `${p.organizerName} cancelled the ${w.fundraiser}, so the sponsorship never runs and the money went back to the card it came from.`;
}

/** The four rules at the foot of the sponsor's page. */
export function materialsRules(w: MaterialsWords, organizerName: string): string[] {
  if (w.music) {
    return [
      "The logo is the patron's own name or image, or one the patron has the right to use.",
      `${organizerName} approves or declines it. Nothing goes up without their yes.`,
      "A declined logo means the sponsorship never runs, and the money goes back in full.",
      `An approved logo stays where it goes for the whole ${w.fundraiser}.`,
    ];
  }
  return [
    "Send only a name, wording or artwork that is yours, or that you have the right to use.",
    `${organizerName} accepts or declines it. Nothing goes up without their yes.`,
    "If it is declined the sponsorship never runs, and the money goes back in full.",
    `Accepting it is not delivery. Door Money holds the money until ${organizerName} documents what was delivered.`,
  ];
}

/** The organizer's side: what arrived, and what deciding does. Second person, on their own dashboard. */
export function decisionWords(w: MaterialsWords): { heading: string; declineWarning: string; fileSent: string } {
  return w.music
    ? { heading: "The sponsor's logo is waiting for your answer", declineWarning: "Declining refunds the sponsor in full and puts the spot back up.", fileSent: "A logo file was sent." }
    : { heading: "The sponsor's materials are waiting for your answer", declineWarning: "Accepting says you can deliver this. Declining refunds the sponsor in full and puts the spot back up.", fileSent: "A file was sent." };
}
