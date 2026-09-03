import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import type { ThemeName } from "@/components/Theme";

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/**
 * The stage light on the right of a hero: a bloom in the page's accent with fluted-glass lines across it.
 * Drop a photograph at public/hero/<theme>.jpg (or png, webp) and it appears under the light on its own.
 * Pass `photo` to use a differently named file in public/hero/ instead.
 * Purely decorative; the heading carries the message.
 */
export function HeroArt({ theme, photo }: { theme: ThemeName; photo?: string }) {
  const name = photo ?? theme;
  const file = EXTENSIONS.map((ext) => `hero/${name}.${ext}`).find((f) => existsSync(path.join(process.cwd(), "public", f)));
  return (
    <div aria-hidden="true" className={`hero-art ${file ? "has-photo" : ""}`}>
      {file && <Image src={`/${file}`} alt="" fill priority sizes="(max-width: 860px) 100vw, 72vw" />}
      {file && <div className="tint" />}
      <div className="bloom" />
      <div className="flutes" />
      <div className="fade" />
    </div>
  );
}
