// What an organizer can offer, per category. Defaults only; the organizer's own price on a lot
// always wins. Keep in sync with supabase/seed.sql and supabase/migrations/0040 and 0047; the sync
// is held by tests/catalog.test.ts rather than by whoever edits this next.
//
// This file is words, not the registry. The surfaces table decides which options a category has
// (src/lib/opportunity-templates.ts reads it), and src/lib/opportunities.ts is the neutral model
// over both. The music pages that describe music by name still read musicSurfaces() from here.

import type { SponsorshipKind } from "@/lib/sponsorship-kinds";

export type ActType = "touring_band" | "house_act" | "soloist";
/** The sections a music fundraiser draws. The pages that describe music by name use this. */
export type MusicGroup = "onstage" | "room" | "online";
export type SurfaceGroup =
  | MusicGroup
  | "field" | "venue"
  | "screen" | "screening"
  | "stage" | "front_of_house"
  | "guest_experience" | "space" | "event" | "community";
export type Period = "run" | "month" | "season" | "production" | "program";

export interface Surface {
  key: string;
  name: string;
  group: SurfaceGroup;
  /** The category whose fundraisers can price this. */
  category: string;
  /** Which music acts this suits. Null outside music, which does not divide organizers this way. */
  appliesTo: ActType[] | null;
  /** A suggested price, or null where none has been set. Never a promise, and never a free option. */
  defaultPriceCents: number | null;
  period: Period;
  seenBy: string;
  blurb: string;
  /**
   * What kind of sponsorship this suits: cash, product, a service, a space, an event, a guest
   * experience (src/lib/sponsorship-kinds.ts). Left out where the name already says it.
   */
  kinds?: readonly SponsorshipKind[];
}

/**
 * The sections, in the order they are drawn. A fundraiser only ever shows its own category's
 * sections, and "online" sits last so it is last for every one of them.
 */
export const GROUPS: Record<SurfaceGroup, { eyebrow: string; heading: string }> = {
  onstage: { eyebrow: "Onstage", heading: "Every camera in the room finds these" },
  room: { eyebrow: "The room", heading: "Where fans slow down" },
  field: { eyebrow: "On the field", heading: "What the squad wears and carries" },
  venue: { eyebrow: "At the ground", heading: "Where the crowd arrives and waits" },
  screen: { eyebrow: "On screen", heading: "What stays with the finished film" },
  screening: { eyebrow: "At screenings", heading: "The room on the night" },
  stage: { eyebrow: "On stage", heading: "What the house sees and hears" },
  front_of_house: { eyebrow: "Front of house", heading: "Where the audience waits and reads" },
  guest_experience: { eyebrow: "Branded guest experience", heading: "What a guest meets in person" },
  space: { eyebrow: "Venue or space", heading: "A part of the room with a name on it" },
  event: { eyebrow: "Events", heading: "A dated program guests book for" },
  community: { eyebrow: "Community", heading: "Meals the venue gives away" },
  online: { eyebrow: "Online and in print", heading: "When reach matters, measure it." },
};

export const CATALOG: Surface[] = [
  { key: "kick_head", name: "Kick drum head", group: "onstage", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 120000, period: "run",
    seenBy: "the whole room, every show, most crowd photos",
    blurb: "The surface that turns up most in crowd photos: front and center, every night. One patron at a time." },
  { key: "case_sticker", name: "Road case spots", group: "onstage", category: "music", appliesTo: ["touring_band"], defaultPriceCents: 35000, period: "run",
    seenBy: "load-in, stage-side, photos of the stack",
    blurb: "A sticker on the flight cases, designed to match the band's own artwork so it blends in." },
  { key: "strap", name: "Guitar straps", group: "onstage", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 45000, period: "run",
    seenBy: "front-on photos of the players",
    blurb: "Custom straps for the front line, with the patron's mark woven in. It looks like normal gear, because it is." },
  { key: "amp_grille", name: "Amp grilles", group: "onstage", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 30000, period: "run",
    seenBy: "the side angles the kick head does not reach",
    blurb: "A small mark on the grille cloth of both cabs. Covers the angles the kick head doesn't, and the amps are in every shot of the players." },
  { key: "riser_fascia", name: "Riser fascia", group: "onstage", category: "music", appliesTo: ["touring_band"], defaultPriceCents: 20000, period: "run",
    seenBy: "wide shots from the back of the room",
    blurb: "A strip along the front of the drum riser. A small add-on that shows up in wide shots." },
  { key: "tip_jar_card", name: "Tip jar card", group: "room", category: "music", appliesTo: ["house_act"], defaultPriceCents: 25000, period: "month",
    seenBy: "the whole room, weekly, including the patron's own regulars",
    blurb: "A printed card on the tip jar of a house act: the patron's name, the musician, one line. The natural fit for a local business backing the musician down the street." },
  { key: "stage_thanks", name: "Stage thank-you", group: "room", category: "music", appliesTo: ["house_act"], defaultPriceCents: 15000, period: "month",
    seenBy: "the room, once a set",
    blurb: "Once a set, from the mic, the musician names the patron keeping the night going. A live read, delivered by someone the room already trusts. Worded by the musician." },
  { key: "merch_runner", name: "Merch table runner", group: "room", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 50000, period: "run",
    seenBy: "every fan who stops at the table",
    blurb: "The patron's mark on the table where fans stop, read and decide. The stage gets glances; the merch table gets pauses." },
  { key: "hang_tags", name: "Hang tags", group: "room", category: "music", appliesTo: ["touring_band"], defaultPriceCents: 35000, period: "run",
    seenBy: "every merch buyer, and everyone who sees them wear it",
    blurb: "A tag on every piece of merch sold, the patron's name on the back of it. The placement that goes home with the fan." },
  { key: "picks", name: "Picks", group: "room", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 15000, period: "run",
    seenBy: "whoever catches one, and keeps it",
    blurb: "Branded picks, band on one face, the patron on the other. Played all night, thrown to the crowd at the end." },
  { key: "poster_credit", name: "Poster credit", group: "online", category: "music", appliesTo: ["touring_band", "house_act"], defaultPriceCents: 30000, period: "run",
    seenBy: "every wall and window the poster goes on",
    blurb: "A credit line on the poster and digital admat. Reaches every wall, window and feed the poster ends up on." },
  { key: "posts_email", name: "Posts and email", group: "online", category: "music", appliesTo: ["touring_band", "house_act", "soloist"], defaultPriceCents: 40000, period: "run",
    seenBy: "the musician's followers and mailing list",
    blurb: "A named thank-you in the announcement post and the musician's mailing list, written by the musician in their own voice. Reach, opens and clicks come with it." },
  { key: "vlog_card", name: "Vlog logo card", group: "online", category: "music", appliesTo: ["touring_band", "soloist"], defaultPriceCents: 25000, period: "run",
    seenBy: "the musician's video audience",
    blurb: "A logo card at the top of every tour vlog, with the view counts to go with it." },
  { key: "rig_rundown", name: "Rig rundown", group: "online", category: "music", appliesTo: ["touring_band"], defaultPriceCents: 40000, period: "run",
    seenBy: "players who buy gear",
    blurb: "A gear walkthrough video with the patron's product in it, made for the players who buy gear." },
  { key: "case_lid", name: "Case lid", group: "onstage", category: "music", appliesTo: ["soloist"], defaultPriceCents: 6000, period: "season",
    seenBy: "the players in the rehearsal room and the pit",
    blurb: "A decal inside the case lid, at eye level whenever the case is open: in the rehearsal room, the pit and the green room." },
  { key: "music_stand", name: "Music stand", group: "room", category: "music", appliesTo: ["soloist"], defaultPriceCents: 9000, period: "season",
    seenBy: "the whole audience, plus the students and parents in it",
    blurb: "A small mark on the stand banner, facing the room at every gig where the player brings their own stand." },
  { key: "program_credit", name: "Recital program credit", group: "online", category: "music", appliesTo: ["soloist"], defaultPriceCents: 4000, period: "season",
    seenBy: "everyone holding a program",
    blurb: "A credit line in the printed program at recitals and chamber dates." },
  { key: "practice_video", name: "Practice-room videos", group: "online", category: "music", appliesTo: ["soloist"], defaultPriceCents: 7000, period: "month",
    seenBy: "the player's video audience",
    blurb: "A month of practice-room videos carrying the patron's name on the card." },

  // Sports, film and theater. No suggested price is set: Door Money has not sold one of these, and
  // a number invented here would read as advice. The organizer sets the price, as they always did.
  { key: "jersey_front", name: "Jersey front", group: "field", category: "sports", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "every fixture, and the photographs of it",
    blurb: "The sponsor's mark on the front of the playing shirt. The team confirms what its league and its kit supplier allow." },
  { key: "warmup_tops", name: "Warm-up tops", group: "field", category: "sports", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "the hour before each home fixture",
    blurb: "A mark on the tops the squad warms up in, for when the shirt itself is already spoken for." },
  { key: "touchline_banner", name: "Touchline banner", group: "venue", category: "sports", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "everyone at a home fixture",
    blurb: "A banner along the touchline at home fixtures, for as long as the venue permits it." },
  { key: "team_sheet", name: "Team sheet", group: "venue", category: "sports", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "everyone handed one at the gate",
    blurb: "A credit on the team sheet or program handed out at home fixtures." },
  { key: "fixture_posts", name: "Fixture posts", group: "online", category: "sports", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "the team's own followers",
    blurb: "A named credit in the team's own fixture announcements, written by the team." },
  { key: "end_credit", name: "End credit", group: "screen", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone who watches to the end",
    blurb: "A credit card in the end titles, with the wording agreed before the edit is locked." },
  { key: "special_thanks", name: "Special thanks", group: "screen", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone who watches to the end",
    blurb: "A named line in the special thanks of the end titles." },
  { key: "product_placement", name: "Agreed product placement", group: "screen", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone who watches the scene",
    blurb: "A product on screen where the story allows it, agreed scene by scene with the director. Nothing appears without that agreement." },
  { key: "screening_signage", name: "Screening signage", group: "screening", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone at a screening the production runs",
    blurb: "The sponsor's mark on the signage at screenings the production organizes itself." },
  { key: "screening_program", name: "Screening program", group: "screening", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone handed a program at those screenings",
    blurb: "A credit in the program handed out at the production's own screenings." },
  { key: "release_posts", name: "Release posts", group: "online", category: "film", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "the production's own followers and mailing list",
    blurb: "A named credit in the production's own announcements and mailing list, written by the filmmaker." },
  { key: "curtain_speech", name: "Curtain speech", group: "stage", category: "theater", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "the house, before each performance",
    blurb: "A named thank-you from the stage before the performance, worded by the company." },
  { key: "set_dressing", name: "Agreed set dressing", group: "stage", category: "theater", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "the house, in the scenes it appears in",
    blurb: "A product used on stage where the production allows it, agreed with the designer." },
  { key: "playbill_credit", name: "Program credit", group: "front_of_house", category: "theater", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "everyone handed a program",
    blurb: "A credit in the program every audience member is handed." },
  { key: "foyer_banner", name: "Foyer signage", group: "front_of_house", category: "theater", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "the house, on the way in and at the interval",
    blurb: "The sponsor's mark on the signage in the foyer, for the length of the production." },
  { key: "production_posts", name: "Production posts", group: "online", category: "theater", appliesTo: null, defaultPriceCents: null, period: "production",
    seenBy: "the company's own followers and mailing list",
    blurb: "A named credit in the company's own announcements and mailing list, written by the company." },

  // Restaurants & hospitality (key `hospitality`). A draft-only category (migration 0047): these
  // can be priced on a private draft and cannot be published or bought. No suggested price, for
  // the same reason as above. Each one says what kind of sponsorship it suits, because here the
  // sponsor's side may be money, product or a service, and Door Money only ever moves the money.
  // Other (migration 0049) has no templates here or in the registry, on purpose.
  { key: "sponsored_martini_cart", name: "Sponsored martini cart", group: "guest_experience", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "guests at the tables the cart visits", kinds: ["guest_experience", "product", "cash"],
    blurb: "A tableside cart that carries the sponsor's name or product. A cash sponsorship pays for the cart and the staff who work it. A beverage brand may also supply what is poured, which the venue and the sponsor agree between them. The venue confirms what its license allows." },
  { key: "sponsored_table_plaque", name: "Sponsored table plaque", group: "space", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "guests seated at the table, and those who pass it", kinds: ["space", "cash"],
    blurb: "A plaque at one table or booth with the sponsor's name on it. A cash sponsorship toward a cost the venue names. The venue approves the wording before anything is engraved." },
  { key: "sponsored_restaurant_space", name: "Sponsored restaurant space", group: "space", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "season",
    seenBy: "guests who use the space, and those who pass it", kinds: ["space", "cash"],
    blurb: "A room, a patio or a counter that carries the sponsor's name on its signage. A cash sponsorship toward building or furnishing it, for as long as the venue and its landlord permit the sign." },
  { key: "chef_residency", name: "Chef residency", group: "event", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "program",
    seenBy: "guests who book during the residency", kinds: ["event", "cash", "service"],
    blurb: "A guest chef in the kitchen for a set period, with the sponsor named on the residency menu and in the venue's announcements of it. A cash sponsorship pays the chef's fee and the ingredients. A sponsor may also provide a service, such as travel or lodging, agreed with the venue." },
  { key: "dinner_series", name: "Dinner series", group: "event", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "program",
    seenBy: "guests at each dinner in the series", kinds: ["event", "product", "cash"],
    blurb: "A set of dinners with the sponsor named on each menu. A cash sponsorship pays for ingredients and staff. A producer or a winery may also supply what is served at a course, agreed with the venue." },
  { key: "community_meal_program", name: "Community meal program", group: "community", category: "hospitality", appliesTo: null, defaultPriceCents: null, period: "program",
    seenBy: "the people the program serves, and its local partners", kinds: ["cash", "product"],
    blurb: "Meals the venue cooks and gives away, with the sponsor named in the venue's announcements of the program. A cash sponsorship pays for food and kitchen hours. A supplier may also give ingredients, agreed with the venue. Nobody who receives a meal is photographed or named for a sponsor." },

  // Digital workers can prepare private drafts. Both placements are controlled by the worker;
  // neither suggests a price or claims an audience size before the worker provides its basis.
  { key: "monthly_email_signature", name: "Monthly email signature", group: "online", category: "digital_workers", appliesTo: null, defaultPriceCents: null, period: "month",
    seenBy: "recipients of eligible emails the worker sends during the month",
    blurb: "A sponsor credit in the worker's email signature for one month. The worker specifies which sending accounts and messages carry it, the exact dates, and the approved wording. Delivery can be documented with a dated sample; a sent email does not establish that its recipient viewed the signature." },
  { key: "virtual_meeting_background", name: "Virtual meeting background", group: "online", category: "digital_workers", appliesTo: null, defaultPriceCents: null, period: "month",
    seenBy: "participants in eligible video meetings where the background is used",
    blurb: "A sponsor credit on a virtual background used during an agreed month of eligible video meetings. The worker defines which calls qualify and controls the placement, subject to meeting and client rules. A sample and a count of qualifying calls can document delivery without identifying participants." },
];

export const WIDGET_TIERS = [
  { key: "thank_you", amountCents: 2500, title: "Name on the tour thank-you", blurb: "Listed on the musician's end-of-run post and mailing list." },
  { key: "merch_card", amountCents: 10000, title: "Name on the merch table card", blurb: "Printed on the counter card at every show." },
] as const;

export type WidgetTierKey = (typeof WIDGET_TIERS)[number]["key"];

export function widgetTier(key: string) {
  return WIDGET_TIERS.find((t) => t.key === key) ?? null;
}

/** Where a fan's name goes, for copy: "the tour thank-you", "the merch table card". */
export function tierPlace(key: string) {
  return key === "merch_card" ? "the merch table card" : "the tour thank-you";
}

/**
 * A music option, which is also the shape the music pages rely on: it fits named act types and it
 * quotes a suggested price. Nothing outside music has either yet.
 */
export type MusicSurface = Surface & { appliesTo: ActType[]; defaultPriceCents: number };

/** Every music option. The pages that talk about musicians by name read this, not the whole list. */
export function musicSurfaces(): MusicSurface[] {
  return CATALOG.filter((s): s is MusicSurface => s.category === "music" && s.appliesTo !== null && s.defaultPriceCents !== null);
}

/** The music options for an act of this kind. */
export function surfacesFor(type: ActType) {
  return CATALOG.filter((s) => s.category === "music" && (s.appliesTo ?? []).includes(type));
}

/**
 * What a fundraiser in this category can offer.
 *
 * Music narrows by act type, because its options depend on what the act carries. No other category
 * does, and a category with no options yet returns none rather than borrowing music's.
 */
export function surfacesForCategory(categoryKey: string, actType: ActType | null): Surface[] {
  if (categoryKey === "music") return actType ? surfacesFor(actType) : [];
  return CATALOG.filter((s) => s.category === categoryKey);
}
