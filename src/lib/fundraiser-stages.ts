/**
 * The guided way to a fundraiser: Project, Funding, Sponsorships, Review.
 *
 * One journey for every category the registry lets save a draft. A stage is a page of the same
 * form, not a second form, and the stage is in the address (`?stage=funding`) so a reload lands
 * where the organizer was. The first two stages are drawn by FundraiserDraftForm. The last two are
 * the fundraiser's workspace for now: sponsorship options are priced there and the readiness
 * checklist is the review, until each gets a stage of its own.
 *
 * What "complete" means here is only which stage to open when somebody comes back to a draft. It is
 * never the publish gate. That stays in src/lib/readiness.ts and in the database (migration 0041),
 * and a stage that is "complete" here can still have everything the gate wants left to do.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */

export const STAGES = ["project", "funding", "sponsorships", "review"] as const;
export type Stage = (typeof STAGES)[number];

/** The stages the draft form draws. */
export type FormStage = "project" | "funding";

export const STAGE_LABEL: Record<Stage, string> = {
  project: "Project",
  funding: "Funding",
  sponsorships: "Sponsorships",
  review: "Review",
};

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

export function isFormStage(value: unknown): value is FormStage {
  return value === "project" || value === "funding";
}

/** `?stage=funding`, read and refused rather than echoed. A repeated parameter takes the first. */
export function stageFromParam(param: string | string[] | undefined): Stage | null {
  const value = Array.isArray(param) ? param[0] : param;
  return isStage(value) ? value : null;
}

export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function previousStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  return i > 0 ? STAGES[i - 1] : null;
}

/** The submit button pressed on the form. Anything else is an ordinary save. */
export type StageIntent = "continue" | "back" | "save";

export function isStageIntent(value: unknown): value is StageIntent {
  return value === "continue" || value === "back" || value === "save";
}

/**
 * Where a save with this intent lands: the next stage, the one before, or the same one. Null when
 * the form did not say what stage it was on, which is the save as it was before there were stages.
 */
export function stageAfter(intent: unknown, stage: unknown): Stage | null {
  if (!isStage(stage) || !isStageIntent(intent)) return null;
  if (intent === "continue") return nextStage(stage) ?? stage;
  if (intent === "back") return previousStage(stage) ?? stage;
  return stage;
}

/** The part of a draft the resume rule reads. */
export type StageDraft = {
  title?: string | null;
  audience_description?: string | null;
  purpose?: string | null;
  sponsor_promise?: string | null;
};

const filled = (v: string | null | undefined) => Boolean(v && v.trim().length > 0);

/**
 * What a stage still asks for, in words, for the resume rule and the summary card. The project is
 * a name and who will experience it; the funding is what the money enables and what a sponsor can
 * count on. A goal, dates and locations are never on this list: an unknown is allowed to stay one.
 */
export function stageMissing(draft: StageDraft, stage: FormStage): string[] {
  if (stage === "project") {
    return [!filled(draft.title) && "a name", !filled(draft.audience_description) && "who will experience it"].filter(
      (v): v is string => typeof v === "string",
    );
  }
  return [!filled(draft.purpose) && "what the funding enables", !filled(draft.sponsor_promise) && "what a sponsor can count on"].filter(
    (v): v is string => typeof v === "string",
  );
}

/** The first form stage with something still to say, or null when both have been answered. */
export function resumeStage(draft: StageDraft): FormStage | null {
  if (stageMissing(draft, "project").length > 0) return "project";
  if (stageMissing(draft, "funding").length > 0) return "funding";
  return null;
}

/** The headline and the line under it, per stage. Second person: the dashboard talks to one person. */
export const STAGE_HEADING: Record<FormStage, { title: string; accent: string; intro: string; continueLabel: string }> = {
  project: {
    title: "What do you want to",
    accent: "make happen?",
    intro: "Name the project and say who will experience it. Anything you do not know yet can stay empty.",
    continueLabel: "Continue to funding",
  },
  funding: {
    title: "What will the funding",
    accent: "make possible?",
    intro: "Say what the money enables. A goal is optional, and it is not the total of the sponsorship options: those come next.",
    continueLabel: "Continue to sponsorships",
  },
};

/** The address of one stage of one draft, carrying the starter kit when there is one to carry. */
export function stagePath(id: string, stage: Stage | null, kit: string | null = null): string {
  const params = new URLSearchParams();
  if (stage) params.set("stage", stage);
  if (kit) params.set("kit", kit);
  const query = params.toString();
  return `/dashboard/runs/${id}${query ? `?${query}` : ""}`;
}
