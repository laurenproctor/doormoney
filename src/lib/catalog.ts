// The standard card. Defaults only; an act's own price on a lot always wins.
// Keep in sync with supabase/seed.sql.

export type ActType = "touring_band" | "house_act" | "soloist";
export type SurfaceGroup = "onstage" | "room" | "online";
export type Period = "run" | "month" | "season";

export interface Surface {
  key: string;
  name: string;
  group: SurfaceGroup;
  appliesTo: ActType[];
  defaultPriceCents: number;
  period: Period;
  seenBy: string;
  blurb: string;
}

export const GROUPS: Record<SurfaceGroup, { eyebrow: string; heading: string }> = {
  onstage: { eyebrow: "Onstage", heading: "Every camera in the room finds these" },
  room: { eyebrow: "The room", heading: "The longest look a patron gets" },
  online: { eyebrow: "Online and in print", heading: "Exposure that comes with numbers" },
};

export const CATALOG: Surface[] = [
  { key: "kick_head", name: "Kick drum head", group: "onstage", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 120000, period: "run",
    seenBy: "the whole room, every show, every photo",
    blurb: "The most photographed surface on any stage. Front and center in every crowd shot, every night of the run. One patron at a time." },
  { key: "case_sticker", name: "Road case spots", group: "onstage", appliesTo: ["touring_band"], defaultPriceCents: 35000, period: "run",
    seenBy: "load-in, stage-side, every photo of the stack",
    blurb: "A sticker on the flight cases, designed to match the band's own artwork so it blends in." },
  { key: "strap", name: "Guitar straps", group: "onstage", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 45000, period: "run",
    seenBy: "every front-on photo of the players",
    blurb: "Custom straps for the front line, with the patron's mark woven in. It looks like normal gear, because it is." },
  { key: "amp_grille", name: "Amp grilles", group: "onstage", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 30000, period: "run",
    seenBy: "the side angles the kick head does not reach",
    blurb: "A small mark on the grille cloth of both cabs. Covers the angles the kick head doesn't, and the amps are in every shot of the players." },
  { key: "riser_fascia", name: "Riser fascia", group: "onstage", appliesTo: ["touring_band"], defaultPriceCents: 20000, period: "run",
    seenBy: "wide shots from the back of the room",
    blurb: "A strip along the front of the drum riser. A small add-on that shows up in wide shots." },
  { key: "tip_jar_card", name: "Tip jar card", group: "room", appliesTo: ["house_act"], defaultPriceCents: 25000, period: "month",
    seenBy: "the whole room, weekly, including the patron's own regulars",
    blurb: "A printed card on the tip jar of a house band: the patron's name, the band, one line. The most popular option for local businesses supporting a nearby venue." },
  { key: "stage_thanks", name: "Stage thank-you", group: "room", appliesTo: ["house_act"], defaultPriceCents: 15000, period: "month",
    seenBy: "the room, once a set",
    blurb: "Once a set, from the mic, the band names the patron keeping the night going. A live read, delivered by someone the room already trusts. Worded by the band." },
  { key: "merch_runner", name: "Merch table runner", group: "room", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 50000, period: "run",
    seenBy: "every fan who stops at the table",
    blurb: "The patron's mark on the table where fans spend two to five minutes deciding. The surface fans spend the most time in front of." },
  { key: "hang_tags", name: "Hang tags", group: "room", appliesTo: ["touring_band"], defaultPriceCents: 35000, period: "run",
    seenBy: "every merch buyer, and everyone who sees them wear it",
    blurb: "A tag on every piece of merch sold, the patron's name on the back of it. The only placement that goes home with the fan and stays there." },
  { key: "picks", name: "Picks", group: "room", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 15000, period: "run",
    seenBy: "whoever catches one, and keeps it",
    blurb: "Branded picks, band on one face, the patron on the other. Played all night, thrown to the crowd at the end." },
  { key: "poster_credit", name: "Poster credit", group: "online", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 30000, period: "run",
    seenBy: "every wall and window the poster goes on",
    blurb: "A credit line on the run's poster and digital admat. Reaches every wall, window and feed the poster ends up on." },
  { key: "posts_email", name: "Posts and email", group: "online", appliesTo: ["touring_band", "house_act", "soloist"], defaultPriceCents: 40000, period: "run",
    seenBy: "the band's followers and mailing list",
    blurb: "A named thank-you in the tour announcement post and the band's mailing list, written by the band in their own voice, which is why it works." },
  { key: "vlog_card", name: "Vlog logo card", group: "online", appliesTo: ["touring_band", "soloist"], defaultPriceCents: 25000, period: "run",
    seenBy: "the band's video audience",
    blurb: "A logo card at the top of every tour vlog. Watched by people who already care." },
  { key: "rig_rundown", name: "Rig rundown", group: "online", appliesTo: ["touring_band"], defaultPriceCents: 40000, period: "run",
    seenBy: "players who buy gear",
    blurb: "A gear walkthrough video with the patron's product in it. Watched almost exclusively by people who buy gear, which is why gear brands rate it above anything on the stage." },
  { key: "case_lid", name: "Case lid", group: "onstage", appliesTo: ["soloist"], defaultPriceCents: 6000, period: "season",
    seenBy: "every player in the rehearsal room and the pit",
    blurb: "A decal inside the case lid, at eye level whenever the case is open. Reaches every player in the rehearsal room, the pit and the green room." },
  { key: "music_stand", name: "Music stand", group: "room", appliesTo: ["soloist"], defaultPriceCents: 9000, period: "season",
    seenBy: "the whole audience, plus the students and parents in it",
    blurb: "A small mark on the stand banner, facing the room at every gig where the player brings their own stand." },
  { key: "program_credit", name: "Recital program credit", group: "online", appliesTo: ["soloist"], defaultPriceCents: 4000, period: "season",
    seenBy: "everyone holding a program",
    blurb: "A credit line in the printed program at recitals and chamber dates." },
  { key: "practice_video", name: "Practice-room videos", group: "online", appliesTo: ["soloist"], defaultPriceCents: 7000, period: "month",
    seenBy: "the player's video audience",
    blurb: "A month of practice-room videos carrying the patron's name on the card." },
];

export const WIDGET_TIERS = [
  { key: "thank_you", amountCents: 2500, title: "Name on the tour thank-you", blurb: "Listed on the act's end-of-run post and mailing list." },
  { key: "merch_card", amountCents: 10000, title: "Name on the merch table card", blurb: "Printed on the counter card at every show of the run." },
] as const;

export function surfacesFor(type: ActType) {
  return CATALOG.filter((s) => s.appliesTo.includes(type));
}
