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

/*
  The Desk register's status tokens.
  ---------------------------------------------------------------------------
  ok is the page's own light, so it changes with the theme and has to be measured under all eight.
  attention is the one color that does not change, which is exactly why it needs measuring: one
  amber has to clear the bar on sixteen different grounds. neutral is the ink at low strength.

  Each pair is read out of globals.css and composited the way a browser composites it: a wash is
  laid over `surface`, and `surface` is itself the ink laid over the ground. Nothing below is a
  number typed beside the design; every one of them is computed from the file.

  If a theme fails, darken the ink. Never lighten the ground: a wash pale enough to rescue a tint
  is a status nobody notices, which is the opposite of what these are for.
*/

/** The declarations of one rule, found by a selector that may be one of several on the rule. */
function desk(selector: string) {
  const at = CSS.indexOf(selector);
  assert.notEqual(at, -1, `globals.css no longer has ${selector}`);
  return CSS.slice(at, CSS.indexOf("}", at));
}
const DESK_DARK = desk(":root, [data-theme] {\n  --ok: var(--accent);");
const DESK_LIGHT = desk(':root[data-mode="light"], [data-mode="light"] [data-theme] {\n  --ok-wash:');

/** "color-mix(in srgb, var(--x) 14%, …)", as a fraction. */
function part(rule: string, name: string): number {
  const found = rule.match(new RegExp(`--${name}:\\s*color-mix\\(in srgb, var\\(--[a-z-]+\\) (\\d+)%`));
  assert.ok(found, `--${name} is no longer a color-mix, so this test is measuring the wrong thing`);
  return Number(found[1]) / 100;
}
/** An rgba() wash over what is behind it, or a flat hex if that is what the room declares. */
function wash(rule: string, name: string, behind: string): string {
  const flat = rule.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (flat) return flat[1];
  const rgba = rule.match(new RegExp(`--${name}:\\s*rgba\\((\\d+), (\\d+), (\\d+), ([0-9.]+)\\)`));
  assert.ok(rgba, `--${name} is neither a hex nor an rgba, so this test cannot composite it`);
  const hex = "#" + [1, 2, 3].map((i) => Number(rgba[i]).toString(16).padStart(2, "0")).join("");
  return mix(hex, behind, Number(rgba[4]));
}

/**
 * A theme that states an ok-ink of its own in the light room, if it does. Read by scanning the
 * rules rather than by a fixed selector, so the selector list can be rewritten without this test
 * quietly stopping measuring anything.
 */
function statedOkInk(theme: string): string | undefined {
  for (const rule of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, selector, body] = rule;
    if (!selector.includes('[data-mode="light"]') || !selector.includes(`[data-theme="${theme}"]`)) continue;
    const found = body.match(/--ok-ink:\s*(#[0-9a-f]{6})/i);
    if (found) return found[1];
  }
  return undefined;
}

/** What a workspace block is actually painted on, in one room, under one light. */
function deskRoom(room: "dark" | "light", theme: string) {
  const t = themeIn(room, theme);
  const rule = room === "dark" ? DESK_DARK : DESK_LIGHT;
  const surfaceHex = rule.match(/--surface:\s*(#[0-9a-f]{6})/i)?.[1];
  const surface = surfaceHex ?? mix(t.ink, t.ground, part(DESK_DARK, "surface"));
  const okInk = (room === "light" ? statedOkInk(theme) : undefined) ?? t.accentInk;
  return {
    ...t,
    surface,
    okInk,
    okWash: mix(t.accent, surface, part(rule, "ok-wash")),
    attentionInk: rule.match(/--attention-ink:\s*(#[0-9a-f]{6})/i)?.[1] ?? "#ffb020",
    attentionWash: wash(rule, "attention-wash", surface),
    neutralWash: mix(t.ink, surface, part(DESK_DARK, "neutral-wash")),
  };
}

for (const room of ["dark", "light"] as const) {
  test(`${room} room: every status word on the Desk register clears 4.5:1 on its own pill`, () => {
    for (const theme of THEMES) {
      const d = deskRoom(room, theme);
      const pairs = [
        ["ok-ink on ok-wash", d.okInk, d.okWash],
        ["attention-ink on attention-wash", d.attentionInk, d.attentionWash],
        ["neutral-ink on neutral-wash", d.muted, d.neutralWash],
        ["attention-ink on the ground", d.attentionInk, d.ground],
        ["attention-ink on a card", d.attentionInk, d.surface],
        ["ink on a card", d.ink, d.surface],
        ["muted on a card", d.muted, d.surface],
      ] as const;
      for (const [what, fg, bg] of pairs) {
        const measured = ratio(fg, bg);
        assert.ok(measured >= 4.5, `${room}/${theme}: ${what} is ${fg} on ${bg}, ${measured.toFixed(2)}:1`);
      }
    }
  });
}

test("the one theme whose ok-ink had to be darkened says so, and nothing else was", () => {
  // Blue's readable tint does not survive its own wash in the light room, so that theme states a
  // darker ok-ink. Every other theme inherits accent-ink, which is the point of the default.
  const darkened = THEMES.filter((theme) => deskRoom("light", theme).okInk !== themeIn("light", theme).accentInk);
  assert.deepEqual(darkened, ["blue"]);
  for (const theme of THEMES) assert.equal(deskRoom("dark", theme).okInk, themeIn("dark", theme).accentInk, `dark/${theme}`);
});
