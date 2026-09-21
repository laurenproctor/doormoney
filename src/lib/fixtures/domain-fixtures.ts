/**
 * One complete set of domain views per starting category, for tests and for a design prototype.
 *
 * Invented, and obviously so: no real organizer, sponsor or venue. Each set is deliberately
 * different in the ways the categories really differ, so a component that quietly assumes music
 * shows it: the team has a region and a country and no city, the film is online-only with no place
 * at all, the theater company's promise is spoken and has no logo, and only music counts shows or
 * suggests a price. A prototype can import these and render every semantic component without a
 * database.
 *
 * Not the seed and not src/lib/sample.ts, which are the music boards the running app falls back to.
 */
import type { Category, CommitmentView, EvidenceView, FundraiserView, OpportunityTemplateView, OpportunityView, OrganizerView, PatronActivityView, SponsorView } from "@/lib/domain";

export type DomainFixture = {
  category: Category;
  organizer: OrganizerView;
  fundraiser: FundraiserView;
  opportunities: OpportunityView[];
  templates: OpportunityTemplateView[];
  commitments: CommitmentView[];
  evidence: EvidenceView;
  sponsor: SponsorView;
  activity: PatronActivityView;
};

const music: DomainFixture = {
  category: { key: "music", label: "Music" },
  organizer: { slug: "low-tide-choir", name: "Low Tide Choir", kindLabel: "Band", bio: "Five voices and a harmonium, on the road most of the autumn.", photoUrl: null, location: { city: "Halifax", region: "Nova Scotia", countryCode: "CA" }, links: [{ label: "lowtidechoir.example", url: "https://lowtidechoir.example/" }] },
  fundraiser: { slug: "autumn-tour", title: "Autumn tour", category: { key: "music", label: "Music" }, kind: "tour", status: "open", facts: "14 shows, Oct 2 to Nov 1", purpose: "Van hire, fuel and four nights of lodging.", audience: "Rooms of 80 to 300, mostly listening rooms and folk clubs.", sponsorPromise: "A mark on the merch table at every show.", activityMode: "in_person", locations: [{ city: "Halifax", countryCode: "CA" }, { city: "Portland", region: "Maine", countryCode: "US" }], href: "/low-tide-choir/support-autumn-tour" },
  opportunities: [
    { id: "m1", name: "Merch table runner", description: "The sponsor's mark on the table where people stop and read.", seenBy: "everyone who stops at the table", priceCents: 45000, saleMethod: "fixed", status: "open" },
    { id: "m2", name: "Posts and email", description: null, seenBy: "the choir's followers and mailing list", priceCents: 30000, saleMethod: "auction", status: "open", topBidCents: 34000, buyNowCents: 60000 },
  ],
  templates: [{ key: "merch_runner", name: "Merch table runner", seenBy: "everyone who stops at the table", suggestedPriceCents: 50000, period: "run" }],
  commitments: [{ key: "selected_show_photos", label: "Photographs from selected shows", detail: "A few, with the room and the date." }],
  evidence: { items: [{ title: "Merch table, Portland", kind: "photo", url: "https://lowtidechoir.example/portland.jpg", note: null, isPublic: true }], withheld: 0 },
  sponsor: { displayName: "Saltbox Coffee", username: "saltbox", kindLabel: "Business", bio: "A roaster two doors from the folk club.", location: "Halifax, Nova Scotia", photoUrl: null, links: [{ label: "saltbox.example", url: "https://saltbox.example/" }], categories: [{ key: "music", label: "Music" }], href: "/patron/saltbox" },
  activity: { support: "backing", organizerName: "Low Tide Choir", organizerHref: "/low-tide-choir", fundraiserTitle: "Autumn tour", category: { key: "music", label: "Music" }, detail: "A name on the tour thank-you", month: "October 2026" },
};

const sports: DomainFixture = {
  category: { key: "sports", label: "Sports teams" },
  // A region and a country, and no city: a county side does not have one.
  organizer: { slug: "fenland-rovers", name: "Fenland Rovers", kindLabel: "Team", bio: "An amateur women's side in its third season.", photoUrl: null, location: { region: "Cambridgeshire", countryCode: "GB" }, links: [] },
  fundraiser: { slug: "spring-season", title: "Spring season", category: { key: "sports", label: "Sports teams" }, status: "live", facts: null, purpose: "Pitch hire, a second kit and travel to six away fixtures.", audience: "About 150 at home fixtures, and the club's followers.", sponsorPromise: "A banner along the touchline at every home fixture.", activityMode: "in_person", locations: [{ region: "Cambridgeshire", countryCode: "GB" }], href: "/fenland-rovers/support-spring-season" },
  opportunities: [
    { id: "s1", name: "Touchline banner", description: "For as long as the ground permits it.", seenBy: "everyone at a home fixture", priceCents: 80000, saleMethod: "fixed", status: "sold", soldTo: "Ouse Valley Physio" },
    { id: "s2", name: "Fixture posts", description: null, seenBy: "the team's own followers", priceCents: 15000, saleMethod: "auction", status: "open", topBidCents: null },
  ],
  templates: [{ key: "touchline_banner", name: "Touchline banner", seenBy: "everyone at a home fixture", suggestedPriceCents: null, period: "season" }],
  commitments: [{ key: "venue_date_record", label: "A record of fixtures, with dates and grounds" }],
  evidence: { items: [], withheld: 2 },
  sponsor: { displayName: "Ouse Valley Physio", username: "ousevalley", kindLabel: "Business", bio: null, location: "Ely", photoUrl: null, links: [], categories: [{ key: "sports", label: "Sports teams" }], href: "/patron/ousevalley" },
  activity: { support: "sponsorship", organizerName: "Fenland Rovers", organizerHref: "/fenland-rovers", fundraiserTitle: "Spring season", category: { key: "sports", label: "Sports teams" }, detail: "Touchline banner", month: "March 2027" },
};

const film: DomainFixture = {
  category: { key: "film", label: "Film" },
  // Online only: no place anywhere, and none is invented.
  organizer: { slug: "slow-river-films", name: "Slow River Films", kindLabel: "Production company", bio: "Two people finishing their first feature documentary.", photoUrl: null, location: null, links: [{ label: "Trailer", url: "https://vimeo.com/slowriver" }] },
  fundraiser: { slug: "the-ferry", title: "The Ferry", category: { key: "film", label: "Film" }, status: "open", facts: null, purpose: "Color, sound mix and festival deliverables.", audience: "Documentary audiences online. No distribution is promised.", sponsorPromise: "A credit in the end titles, worded together before picture lock.", activityMode: "online", locations: [], href: "/slow-river-films/support-the-ferry" },
  opportunities: [{ id: "f1", name: "End credit", description: "A credit card in the end titles.", seenBy: "everyone who watches to the end", priceCents: 120000, saleMethod: "fixed", status: "open" }],
  templates: [{ key: "end_credit", name: "End credit", seenBy: "everyone who watches to the end", suggestedPriceCents: null, period: "production" }],
  commitments: [{ key: "other", label: "A frame of the finished credit", detail: "Sent when the edit is locked." }],
  evidence: { items: [{ title: "End credit, locked cut", kind: "note", url: null, note: "Frame 01:22:14, as agreed.", isPublic: false }], withheld: 0 },
  sponsor: { displayName: "Marisol Okafor", username: null, kindLabel: null, bio: null, location: null, photoUrl: null, links: [], categories: [{ key: "film", label: "Film" }, { key: "theater", label: "Theater" }], href: null },
  activity: { support: "sponsorship", organizerName: "Slow River Films", organizerHref: null, fundraiserTitle: "The Ferry", category: { key: "film", label: "Film" }, detail: "End credit", month: "January 2027" },
};

const theater: DomainFixture = {
  category: { key: "theater", label: "Theater" },
  organizer: { slug: "attic-company", name: "The Attic Company", kindLabel: null, bio: "A company of six in a room above a bakery.", photoUrl: null, location: { city: "Wellington", countryCode: "NZ" }, links: [] },
  fundraiser: { slug: "a-number", title: "A Number", category: { key: "theater", label: "Theater" }, status: "closed", facts: "Nov 5 to Nov 21", purpose: "Rights, a set build and three weeks of rehearsal room.", audience: "Sixty seats a night for twelve nights.", sponsorPromise: "A named thank-you from the stage before each performance.", activityMode: "hybrid", locations: [{ city: "Wellington", countryCode: "NZ" }], href: "/attic-company/support-a-number" },
  // Spoken, so there is no logo anywhere in this set.
  opportunities: [{ id: "t1", name: "Curtain speech", description: "Worded by the company.", seenBy: "the house, before each performance", priceCents: 25000, saleMethod: "fixed", status: "unsold" }],
  templates: [{ key: "curtain_speech", name: "Curtain speech", seenBy: null, suggestedPriceCents: null, period: null }],
  commitments: [],
  evidence: { items: [], withheld: 0 },
  sponsor: { displayName: "Cuba Street Trust", username: "cubastreet", kindLabel: "Nonprofit", bio: "Small grants for small rooms.", location: "Online", photoUrl: null, links: [], categories: [], href: "/patron/cubastreet" },
  activity: { support: "sponsorship", organizerName: "The Attic Company", organizerHref: null, fundraiserTitle: "A Number", category: null, detail: "Curtain speech", month: "November 2026" },
};

export const DOMAIN_FIXTURES: Record<"music" | "sports" | "film" | "theater", DomainFixture> = { music, sports, film, theater };

/** A category nobody has written a word of TypeScript for, to prove a fifth one is data. */
export const FIFTH_CATEGORY_FIXTURE: DomainFixture = {
  ...theater,
  category: { key: "community_dance", label: null },
  fundraiser: { ...theater.fundraiser, category: { key: "community_dance", label: null }, title: "Spring term" },
  activity: { ...theater.activity, category: { key: "community_dance" } },
};
