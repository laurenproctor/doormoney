"use client";
import type { KitRecommendation } from "@/lib/starter-kit-recommendations";
import type { StarterKit, StarterKitAvailability, StarterKitGroup } from "@/lib/starter-kits";

const DRAFT_ONLY_NOTE = "This category is not open for publishing yet. A fundraiser started from this kit stays a private draft.";

/**
 * The starter kits for one category, and what the chosen one suggests.
 *
 * Presentational: it is handed the group and says which kit was picked. It saves nothing, offers
 * nothing and prices nothing. FundraiserDraftForm owns the state (src/lib/starter-kit-draft.ts).
 */
export function StarterKitPicker({ group, categoryChosen, selectedKey, recommendations, onSelect }: {
  group: StarterKitGroup | null;
  categoryChosen: boolean;
  selectedKey: string | null;
  recommendations: KitRecommendation[];
  onSelect: (key: string) => void;
}) {
  if (!categoryChosen) return <p className="my-4 text-[15px] text-muted">Choose a category to see sponsorship ideas for it.</p>;
  if (!group) return <p className="my-4 text-[15px] text-muted">There are no starter kits for this category yet. The form below works without one.</p>;
  const selected = group.kits.find((item) => item.kit.key === selectedKey) ?? null;
  return <div className="my-4">
    <p className="caps mb-3 text-[14px] text-muted">Sponsorship ideas for {group.label}</p>
    <div className="grid gap-3 md:grid-cols-2">
      {group.kits.map(({ kit, availability }) => {
        const on = kit.key === selectedKey;
        return <button key={kit.key} type="button" onClick={() => onSelect(kit.key)} aria-pressed={on}
          className={`cursor-pointer border p-4 text-left transition-colors ${on ? "border-accent-line bg-accent/10" : "border-field-line bg-transparent hover:border-ink/50"}`}>
          <span className="heading block text-[17px]">{kit.label}</span>
          <span className="mt-1 block text-[14.5px] text-muted">{kit.shortDescription}</span>
          {availability === "draft_only" && <span className="caps mt-2 block text-[14px] text-accent-ink">Draft only</span>}
        </button>;
      })}
    </div>
    <div aria-live="polite">
      {selected && <KitDetail kit={selected.kit} availability={selected.availability} recommendations={recommendations} />}
    </div>
  </div>;
}

function KitDetail({ kit, availability, recommendations }: { kit: StarterKit; availability: StarterKitAvailability; recommendations: KitRecommendation[] }) {
  return <section className="edge mt-4 bg-panel p-5">
    <p className="caps text-[14px] text-muted">Starter kit</p>
    <h3 className="heading mt-1 text-[20px]">{kit.label}</h3>
    <p className="mt-2 max-w-[62ch] text-[15px]">{kit.whatItFunds}</p>
    <p className="mt-3 max-w-[62ch] text-[15px] text-muted">
      The form below now holds examples from this kit. Change any of them to fit your own work.
      Nothing is offered, priced or published until you do it yourself.
    </p>
    <div className="mt-4 grid gap-5 md:grid-cols-2">
      <KitList heading="What the funding often covers" items={kit.suggestedNeeds} />
      <KitList heading="Who often sponsors this" items={kit.suggestedSponsorTypes} />
    </div>
    {recommendations.length > 0 && <div className="mt-5">
      <p className="caps mb-2 text-[14px] text-muted">Sponsorship options to consider</p>
      <ul className="text-[15px]">
        {recommendations.map((item) => <li key={item.key} className="border-t border-line py-2">
          {item.name}{item.seenBy && <span className="block text-[14.5px] text-muted">Seen by {item.seenBy}.</span>}
        </li>)}
      </ul>
      <p className="mt-2 max-w-[62ch] text-[14.5px] text-muted">
        These are suggestions. After the draft is saved, you choose which options to offer and you set every price.
      </p>
    </div>}
    {kit.note && <p className="mt-4 max-w-[62ch] text-[14.5px] text-accent-ink">{kit.note}</p>}
    {availability === "draft_only" && <p className="mt-4 max-w-[62ch] text-[14.5px] text-accent-ink">{DRAFT_ONLY_NOTE}</p>}
  </section>;
}

function KitList({ heading, items }: { heading: string; items: readonly string[] }) {
  return <div>
    <p className="caps mb-2 text-[14px] text-muted">{heading}</p>
    <ul className="text-[15px]">{items.map((item) => <li key={item} className="border-t border-line py-1.5">{item}</li>)}</ul>
  </div>;
}
