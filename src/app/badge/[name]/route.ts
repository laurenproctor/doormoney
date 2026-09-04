import { LOGO_MARK } from "@/components/Logo";
import { SITE } from "@/lib/site";

/*
  Downloadable assets for link-only platforms (docs/ROADMAP.md, Phase 4):
    /badge/dark.svg      "Backed on Door Money", for a dark site
    /badge/light.svg     the same on paper
    /badge/button.svg?act=Gutter%20Hymns   "Back Gutter Hymns on Door Money", the link button
  Plain SVG with system font fallbacks, so it renders the same wherever it is pasted.
*/

const INK = { dark: { bg: "#050a1c", ink: "#f4f0e8", accent: "#8296ff", line: "rgba(244,240,232,0.24)" }, light: { bg: "#f4f0e8", ink: "#0a0a0a", accent: "#3d5afe", line: "rgba(10,10,10,0.24)" } };
const SERIF = "'Bodoni Moda','Bodoni MT',Didot,'Didot LT STD',Georgia,serif";
const SANS = "Archivo,Helvetica,Arial,sans-serif";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/** The monogram, scaled to `h` tall with its top-left corner at (x, y). */
function mark(x: number, y: number, h: number, fill: string) {
  const { paths, transform, box } = LOGO_MARK;
  const s = h / box.h;
  return `<g transform="translate(${x},${y}) scale(${s}) translate(${-box.x},${-box.y})" fill="${fill}"><g transform="${transform}">${paths.map((d) => `<path d="${d}"/>`).join("")}</g></g>`;
}

function badge(look: keyof typeof INK) {
  const c = INK[look];
  const w = 236;
  const h = 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="Backed on Door Money">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="${c.bg}" stroke="${c.line}"/>
${mark(14, 9, 30, c.ink)}
<text x="42" y="19" font-family="${SANS}" font-size="11" letter-spacing="1.6" fill="${c.accent}">BACKED ON</text>
<text x="42" y="38" font-family="${SERIF}" font-size="18" letter-spacing="0.6" fill="${c.ink}">DOOR MONEY</text>
</svg>`;
}

function button(act: string) {
  const c = INK.dark;
  const label = `BACK ${act.toUpperCase()} ON DOOR MONEY`;
  // Serif caps at 15px, tracked, run about 11.5px a glyph. The text is pinned to that width so a
  // narrower or wider serif on the viewer's machine spaces out rather than spilling over the edge.
  const textW = Math.ceil(label.length * 11.5);
  const w = 42 + textW + 20;
  const h = 44;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(`Back ${act} on Door Money`)}">
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="#3d5afe" stroke="#3d5afe"/>
${mark(14, 8, 28, c.ink)}
<text x="42" y="28" font-family="${SERIF}" font-size="15" letter-spacing="1" textLength="${textW}" lengthAdjust="spacing" fill="${c.ink}">${esc(label)}</text>
</svg>`;
}

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const url = new URL(req.url);
  let svg: string | null = null;
  if (name === "dark.svg") svg = badge("dark");
  else if (name === "light.svg") svg = badge("light");
  else if (name === "button.svg") svg = button((url.searchParams.get("act") ?? SITE.name).slice(0, 60));
  if (!svg) return new Response("Not found", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
