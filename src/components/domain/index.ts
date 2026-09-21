/*
  The semantic domain components: the contract between the domain and the design.

  Each one takes views from src/lib/domain.ts and words from src/lib/category-words.ts, and uses
  the shared primitives and tokens. None of them queries Supabase, starts a payment, imports a
  server action, or imports the music catalog. tests/domain-components.test.ts holds all of that,
  and renders every one of them for music, sports, film and theater.

  A redesign changes these files. It should not need to change what they are given.
*/
export { AudienceSummary, FundingPurpose, SponsorPromise } from "./questions";
export { CategoryBadge } from "./CategoryBadge";
export { DeliveryCommitment } from "./DeliveryCommitment";
export { EvidenceSummary } from "./EvidenceSummary";
export { FundraiserHeader } from "./FundraiserHeader";
export { FundraiserStatus } from "./FundraiserStatus";
export { LocationSummary } from "./LocationSummary";
export { OpportunityCard } from "./OpportunityCard";
export { OpportunityEditor } from "./OpportunityEditor";
export { OrganizerProfileHeader } from "./OrganizerProfileHeader";
export { PatronActivityItem } from "./PatronActivityItem";
export { SponsorProfileCard } from "./SponsorProfileCard";
