"use client";
import { discoveryChoices, type DiscoveryRegistry, type DiscoveryTag } from "@/lib/discovery";
import { labelClass } from "@/components/DashboardShell";

/**
 * The structured discovery questions, drawn from the registry (migration 0053).
 *
 * Every question and every answer here is a database row. This file decides how they are asked and
 * nothing about which ones exist, the way src/components/FundraiserDraftForm.tsx draws a category's
 * details from `fundraiser_categories` without holding a list of them. A category with no tags of
 * its own, or a registry that did not load, draws nothing at all.
 *
 * None of it is required. An organizer who answers none has answered none, and a fundraiser with no
 * tags publishes exactly as it does today. These supplement the sentences above them; they are
 * never read as a substitute for what the organizer wrote.
 *
 * Every box is one checkbox named `discovery_tag`, so the action reads them with getAll and the set
 * of keys never has to be repeated in a hidden field.
 */
export function DiscoveryTagFields({
  registry,
  categoryKey,
  selected,
  onToggle,
}: {
  registry: DiscoveryRegistry;
  categoryKey: string;
  selected: readonly string[];
  onToggle: (key: string, on: boolean) => void;
}) {
  const choices = categoryKey ? discoveryChoices(registry, "fundraiser", categoryKey) : [];
  if (choices.length === 0) return null;

  // A tag that has since been retired stays on the fundraiser that already carries it, so it is
  // drawn, checked, beside the ones still on offer. Unchecking it is the way to let it go.
  const byFacet = new Map(choices.map((choice) => [choice.facet.key, choice.tags.slice()]));
  for (const key of selected) {
    const tag = registry.tags.find((t) => t.key === key);
    const list = tag ? byFacet.get(tag.facetKey) : undefined;
    if (tag && list && !list.some((t) => t.key === tag.key)) list.push(tag);
  }

  return (
    <div className="my-6 border-t border-line pt-6">
      <p className="mb-1 text-[15px]">These help a sponsor find work like yours. All of them are optional.</p>
      <p className="mb-5 text-[14.5px] text-muted">
        Picking none changes nothing about the fundraiser. What you wrote above is still what a sponsor reads.
      </p>
      {choices.map(({ facet }) => {
        const tags = byFacet.get(facet.key) ?? [];
        const chosen = tags.filter((tag) => selected.includes(tag.key)).length;
        return (
          <fieldset key={facet.key} className="mb-6">
            <legend className={labelClass}>{facet.label}</legend>
            {facet.prompt && <p className="mt-1 mb-3 text-[14.5px] text-muted">{facet.prompt}</p>}
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Choice
                  key={tag.key}
                  tag={tag}
                  checked={selected.includes(tag.key)}
                  full={chosen >= facet.maxTags}
                  onToggle={onToggle}
                />
              ))}
            </div>
            <p className="mt-2 text-[14px] text-muted">
              {chosen} of {facet.maxTags} chosen.
            </p>
          </fieldset>
        );
      })}
    </div>
  );
}

function Choice({
  tag,
  checked,
  full,
  onToggle,
}: {
  tag: DiscoveryTag;
  checked: boolean;
  /** True once the facet is at its limit. The boxes already ticked stay clickable, so one can go. */
  full: boolean;
  onToggle: (key: string, on: boolean) => void;
}) {
  return (
    <label
      title={tag.help ?? undefined}
      className={`caps edge cursor-pointer bg-panel px-3 py-2 text-[14.5px] has-[:checked]:border-accent has-[:checked]:bg-accent has-[:checked]:text-on-accent ${
        !checked && full ? "opacity-50" : ""
      }`}
    >
      <input
        type="checkbox"
        name="discovery_tag"
        value={tag.key}
        checked={checked}
        disabled={!checked && full}
        onChange={(e) => onToggle(tag.key, e.target.checked)}
        className="sr-only"
      />
      {tag.label}
    </label>
  );
}
