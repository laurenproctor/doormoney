/*
  Contrast, read out of globals.css rather than asserted from a list kept beside it.

  The design system states the rule in words ("accent-ink is the tint of the accent that clears
  4.5:1 on its ground") and the light room added a second reason to hold to it: on a near-white
  ground a tint that is a shade too light stops being text and becomes decoration. The numbers are
  easy to break by hand and impossible to see in a diff, so they are measured here, in both rooms,
  for every theme.

  What each pair has to clear is WCAG 2.1: 4.5:1 for text under 24px, 3:1 for the edge of a control
  or a state, and 4.5:1 again for text sitting on an accent fill. Two of them are aimed higher than
  the bar on purpose. Ink, muted and accent-ink are also read inside a hero, where they sit on a
  wash of the page's accent rather than on the bare ground and give up about a fifth of their
  contrast, so they are aimed at 7:1 to leave room for it and the wash is checked here too.
*/
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const CSS = readFileSync("src/app/globals.css", "utf8");
const THEMES = ["blue", "lime", "magenta", "amber", "teal", "violet", "red", "mono"] as const;
/** The strength the light room's bloom is capped at, and so the darkest a hero's paper goes. */
const HERO_WASH = 0.14;

type Rgb = [number, number, number];
const parse = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const luminance = (rgb: Rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(parse(a)), luminance(parse(b))].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** An accent laid over the ground at `part`, which is what a hero's paper actually is. */
const mix = (accent: string, ground: string, part: number): string =>
  "#" + parse(accent).map((v, i) => Math.round(v * part + parse(ground)[i] * (1 - part)).toString(16).padStart(2, "0")).join("");

/** The declarations of one rule, by the selector it opens with. */
function block(selector: string) {
  const at = CSS.indexOf(selector);
  assert.notEqual(at, -1, `globals.css no longer has a rule for ${selector}`);
  return CSS.slice(at, CSS.indexOf("}", at));
}
const token = (rule: string, name: string) => rule.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];

type Room = { ground: string; ink: string; muted: string; accent: string; accentInk: string; onAccent: string };
function themeIn(room: "dark" | "light", theme: string): Room {
  const dark = block(`\n[data-theme="${theme}"] {`);
  const darkRoot = block(":root {\n  color-scheme: dark;");
  const read = (rule: string, name: string, fallback?: string) => {
    const value = token(rule, name) ?? fallback;
    assert.ok(value, `${room}/${theme} has no --${name}`);
    return value;
  };
  if (room === "dark") {
    return { ground: read(dark, "ground", token(darkRoot, "ground")), ink: read(darkRoot, "ink"),
      muted: read(dark, "muted"), accent: read(dark, "accent"),
      accentInk: read(dark, "accent-ink"), onAccent: read(dark, "on-accent") };
  }
  const light = block(`:root[data-mode="light"][data-theme="${theme}"]`);
  const lightRoot = block(':root[data-mode="light"] {');
  return { ground: read(light, "ground"), ink: read(lightRoot, "ink"), muted: read(light, "muted"),
    // A light theme states only what it changes; the rest is the same light as in the dark.
    accent: token(light, "accent") ?? read(dark, "accent"),
    accentInk: read(light, "accent-ink"), onAccent: token(light, "on-accent") ?? read(dark, "on-accent") };
}

for (const room of ["dark", "light"] as const) {
  test(`${room} room: every theme's text clears 4.5:1 on its own ground`, () => {
    for (const theme of THEMES) {
      const t = themeIn(room, theme);
      for (const [name, color] of [["ink", t.ink], ["muted", t.muted], ["accent-ink", t.accentInk]] as const) {
        const measured = ratio(color, t.ground);
        assert.ok(measured >= 4.5, `${room}/${theme}: ${name} ${color} on ${t.ground} is ${measured.toFixed(2)}:1`);
      }
    }
  });

  test(`${room} room: an edge a person has to find clears 3:1`, () => {
    for (const theme of THEMES) {
      const t = themeIn(room, theme);
      // What --accent-line resolves to: the light itself in the dark room, the readable tint on paper.
      const line = room === "dark" ? t.accent : t.accentInk;
      const measured = ratio(line, t.ground);
      assert.ok(measured >= 3, `${room}/${theme}: accent-line ${line} on ${t.ground} is ${measured.toFixed(2)}:1`);
    }
  });

  test(`${room} room: text on an accent fill clears 4.5:1`, () => {
    for (const theme of THEMES) {
      const t = themeIn(room, theme);
      const measured = ratio(t.onAccent, t.accent);
      assert.ok(measured >= 4.5, `${room}/${theme}: on-accent ${t.onAccent} on ${t.accent} is ${measured.toFixed(2)}:1`);
    }
  });
}

test("light room: muted and accent-ink are aimed at 7:1, so they survive a hero's wash", () => {
  for (const theme of THEMES) {
    const t = themeIn("light", theme);
    for (const [name, color] of [["muted", t.muted], ["accent-ink", t.accentInk]] as const) {
      const onGround = ratio(color, t.ground);
      assert.ok(onGround >= 7, `light/${theme}: ${name} is ${onGround.toFixed(2)}:1 on its ground, under the 7:1 it is aimed at`);
      const onWash = ratio(color, mix(t.accent, t.ground, HERO_WASH));
      assert.ok(onWash >= 4.5, `light/${theme}: ${name} is ${onWash.toFixed(2)}:1 on the hero wash`);
    }
  }
});

test("the light room's bloom stays at the strength those numbers were measured against", () => {
  const rule = CSS.slice(CSS.indexOf('[data-mode="light"] .hero-art > .bloom'));
  const opacity = rule.match(/opacity:\s*([0-9.]+)/)?.[1];
  assert.equal(
    opacity,
    String(HERO_WASH),
    "the light room's hero bloom changed strength: re-measure muted and accent-ink on the new wash before changing this",
  );
});

test("a control's edge never falls back to the raw accent in the light room", () => {
  // The token exists, and is the accent in one room and the readable tint in the other.
  assert.match(CSS, /:root, \[data-theme\] \{ --accent-line: var\(--accent\); \}/);
  assert.match(CSS, /\[data-mode="light"\] \[data-theme\] \{ --accent-line: var\(--accent-ink\); \}/);
  // The focus ring is the one edge that has to hold everywhere, so it reads the token.
  assert.match(CSS, /:focus-visible \{ outline: 2px solid var\(--accent-line\)/);
});
