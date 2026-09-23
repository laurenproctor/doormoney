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

/** The stages the guided journey draws itself: every one of them, now that Review is one. */
export type JourneyStage = FormStage | "sponsorships" | "review";

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

export function isJourneyStage(value: unknown): value is JourneyStage {
  return isFormStage(value) || value === "sponsorships" || value === "review";
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

/**
 * Where a saved draft opens: the first stage with something still to say, and Review once the
 * three before it have been answered. A draft always lands somewhere in the journey; the
 * workspace is for a fundraiser that has been published.
 *
 * The sponsorships stage is owed while a category that has sponsorship option templates has no
 * option saved. A category with no templates (Other today) has nothing to price, so it is not sent
 * there again: what it can say about proposed visibility it said on the funding stage.
 */
export function resumeStage(draft: StageDraft, options: { optionCount: number; hasTemplates: boolean } = { optionCount: 1, hasTemplates: false }): JourneyStage {
  if (stageMissing(draft, "project").length > 0) return "project";
  if (stageMissing(draft, "funding").length > 0) return "funding";
  if (options.hasTemplates && options.optionCount === 0) return "sponsorships";
  return "review";
}

/** The headline and the line under it, per stage. Second person: the dashboard talks to one person. */
export const STAGE_HEADING: Record<JourneyStage, { title: string; accent: string; intro: string; continueLabel: string }> = {
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
  sponsorships: {
    title: "What can a sponsor",
    accent: "count on?",
    intro: "Build one sponsorship option at a time: where the sponsor appears, what it costs, what they send, and what you deliver. A partial option can be saved; anything missing is named, never filled in for you.",
    continueLabel: "Continue to review",
  },
  review: {
    title: "A promise you can",
    accent: "stand behind.",
    intro: "Read the fundraiser the way a sponsor would: what you want to make possible, and what you can credibly deliver in return. Then decide whether it goes up.",
    continueLabel: "Publish fundraiser",
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
