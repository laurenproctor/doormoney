import type { Appearance } from "@stripe/stripe-js";

/**
 * Stripe's own form, wearing the room's light.
 *
 * The tokens are read off the document at call time rather than hard-coded, so a Stripe Element
 * picks up whichever accent the page it sits on is lit with: lime on a fundraiser board, blue in
 * the widget. Called from client components only; it reads getComputedStyle.
 */
export function elementsAppearance(): Appearance {
  const css = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  const accent = v("--accent", "#3d5afe");
  const ink = v("--ink", "#f4f0e8");
  const ground = v("--ground", "#050a1c");
  return {
    theme: "night",
    variables: {
      colorPrimary: accent,
      colorBackground: ground,
      colorText: ink,
      colorTextSecondary: v("--muted", "#9aa5c4"),
      colorTextPlaceholder: v("--muted", "#9aa5c4"),
      colorDanger: v("--accent-ink", "#8296ff"),
      fontFamily: "Archivo, Helvetica, Arial, sans-serif",
      fontSizeBase: "15px",
      borderRadius: "0",
      spacingUnit: "4px",
    },
    rules: {
      ".Input": { border: "1px solid rgba(244, 240, 232, 0.16)", boxShadow: "none", padding: "10px 12px" },
      ".Input:focus": { border: `1px solid ${accent}`, boxShadow: "none" },
      ".Tab": { border: "1px solid rgba(244, 240, 232, 0.16)", boxShadow: "none" },
      ".Tab--selected": { border: `1px solid ${accent}`, boxShadow: "none" },
      ".Label": { textTransform: "uppercase", letterSpacing: "0.14em", fontSize: "14px", marginBottom: "6px" },
    },
  };
}
