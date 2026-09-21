/**
 * The draft form's state while a starter kit may be in play.
 *
 * FundraiserDraftForm holds this and nothing else decides what a kit does to it. It lives here, as
 * a pure reducer, so the rules can be tested without a browser:
 *
 *   A kit fills only empty fields, and every field it fills stays editable.
 *   A kit is applied only to its own category. One from another category is refused.
 *   Switching category drops the kit, takes its unedited examples back out, and starts the category
 *   details empty, so nothing that belonged to sports or hospitality rides along into film.
 *   Music's performance format never leaves music.
 *   Starting from scratch takes the kit's unedited examples back out too.
 *
 * The chosen kit is creation context. It is never saved: the draft schema is strict and `runs` has
 * no column for it, so it lives in this state and, for one hop after the first save, in the URL.
 * Nothing here creates a fundraiser, an option, a price or a commitment.
 *
 * Pure, and importable from a client component: nothing here reads the database.
 */
import {
  applyStarterKit,
  clearStarterKit,
  kitFitsCategory,
  starterKit,
  type KitCategory,
  type KitTextField,
  type StarterKitError,
} from "@/lib/starter-kits";

/** The inputs the form controls, as a form holds them: "" is "not answered". */
export type KitDraftFields = {
  category_key: string;
  title: string;
  purpose: string;
  audience_description: string;
  sponsor_promise: string;
  activity_mode: string;
  kind: string;
  category_details: Record<string, string>;
};

export type KitDraftMode = "idea" | "scratch";

export type KitDraftState = {
  mode: KitDraftMode;
  /** The kit in play, or null. Never submitted as part of the draft. */
  kitKey: string | null;
  fields: KitDraftFields;
  /** Why the last kit was refused, until the next thing the organizer does. */
  notice: StarterKitError | null;
  /** The saved draft's category and details, so switching back to it brings its own details back. */
  saved: { category_key: string; category_details: Record<string, string> } | null;
};

export type KitDraftAction =
  | { type: "mode"; mode: KitDraftMode }
  | { type: "category"; key: string }
  | { type: "kit"; key: string }
  | { type: "field"; name: KitTextField | "activity_mode" | "kind"; value: string }
  | { type: "detail"; key: string; value: string };

type SavedDraft = {
  category_key: string;
  title: string | null;
  purpose: string | null;
  audience_description: string | null;
  sponsor_promise: string | null;
  activity_mode: string | null;
  kind: string | null;
  category_details: Record<string, string> | null;
};

/**
 * Where the form starts. A saved draft starts from itself, in scratch mode, with no kit. A new
 * fundraiser starts from a linked kit where there is one, and otherwise empty, on music for a
 * music organizer exactly as before.
 */
export function initialKitDraft(input: {
  draft: SavedDraft | null;
  musicOrganizer: boolean;
  categories: readonly KitCategory[];
  /** The kit a link named, already resolved by starterKitFromLink. */
  kitKey?: string | null;
  /** Why the link's kit was refused, to say so above the ordinary form. */
  linkError?: StarterKitError | null;
}): KitDraftState {
  const { draft, musicOrganizer, kitKey, categories } = input;
  if (draft) {
    const details = { ...(draft.category_details ?? {}) };
    return {
      mode: "scratch",
      kitKey: null,
      notice: null,
      saved: { category_key: draft.category_key, category_details: details },
      fields: {
        category_key: draft.category_key,
        title: draft.title ?? "",
        purpose: draft.purpose ?? "",
        audience_description: draft.audience_description ?? "",
        sponsor_promise: draft.sponsor_promise ?? "",
        activity_mode: draft.activity_mode ?? "",
        kind: draft.kind ?? "",
        category_details: { ...details },
      },
    };
  }
  const blank: KitDraftFields = { category_key: "", title: "", purpose: "", audience_description: "", sponsor_promise: "", activity_mode: "", kind: "", category_details: {} };
  const start: KitDraftState = { mode: "idea", kitKey: null, notice: null, saved: null, fields: blank };
  if (kitKey) {
    const linked = kitDraftReducer(start, { type: "kit", key: kitKey }, categories);
    if (linked.kitKey) return linked;
    // A link to a kit that cannot be used lands on the ordinary form, with the reason.
    return { ...linked, fields: { ...blank, category_key: musicOrganizer ? "music" : "" } };
  }
  return { ...start, notice: input.linkError ?? null, fields: { ...blank, category_key: musicOrganizer ? "music" : "" } };
}

export function kitDraftReducer(state: KitDraftState, action: KitDraftAction, categories: readonly KitCategory[]): KitDraftState {
  switch (action.type) {
    case "field":
      return { ...state, notice: null, fields: { ...state.fields, [action.name]: action.value } };

    case "detail":
      return { ...state, notice: null, fields: { ...state.fields, category_details: { ...state.fields.category_details, [action.key]: action.value } } };

    case "mode": {
      if (action.mode === "idea") return { ...state, mode: "idea", notice: null };
      return { ...state, mode: "scratch", kitKey: null, notice: null, fields: clearStarterKit(state.kitKey, state.fields) };
    }

    case "category": {
      if (action.key === state.fields.category_key) return state;
      const kit = starterKit(state.kitKey);
      const keeps = kit !== null && kitFitsCategory(kit, action.key);
      const cleared = keeps ? state.fields : clearStarterKit(state.kitKey, state.fields);
      return {
        ...state,
        notice: null,
        kitKey: keeps ? state.kitKey : null,
        fields: {
          ...cleared,
          category_key: action.key,
          // Details belong to the category chosen with them. Only the saved draft's own come back.
          category_details: state.saved?.category_key === action.key ? { ...state.saved.category_details } : {},
          kind: action.key === "music" ? cleared.kind : "",
        },
      };
    }

    case "kit": {
      if (action.key === state.kitKey) return { ...state, notice: null };
      // The kit before this one goes first, so two kits never blend their examples.
      const base = clearStarterKit(state.kitKey, state.fields);
      const applied = applyStarterKit(action.key, base, categories);
      if (!applied.ok) return { ...state, notice: applied.error };
      const v = applied.values;
      return {
        ...state,
        mode: "idea",
        kitKey: applied.kit.key,
        notice: null,
        fields: {
          category_key: v.category_key,
          title: v.title ?? "",
          purpose: v.purpose ?? "",
          audience_description: v.audience_description ?? "",
          sponsor_promise: v.sponsor_promise ?? "",
          activity_mode: v.activity_mode ?? "",
          kind: v.kind ?? "",
          category_details: v.category_details,
        },
      };
    }
  }
}
