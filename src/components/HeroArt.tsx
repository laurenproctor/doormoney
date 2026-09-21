import { existsSync } from "node:fs";
import path from "node:path";
import Image from "next/image";
import type { ThemeName } from "@/components/Theme";

const EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

/**
 * The stage light on the right of a hero: a bloom in the page's accent with fluted-glass lines across it.
 * Drop a photograph at public/hero/<theme>.jpg (or png, webp) and it appears under the light on its own.
 * Pass `photo` to use a differently named file in public/hero/ instead, or `src` for a full URL
 * (an act's own photo from storage), which wins over both. Pass `signed` with a short-lived signed
 * URL from a private bucket (a patron's header): it is drawn as a plain image, because the image
 * optimizer only fetches public storage paths (next.config.ts) and a signed link must not be cached
 * under one address anyway.
 * Purely decorative; the heading carries the message.
 */
export function HeroArt({ theme, photo, src, signed = false }: { theme: ThemeName; photo?: string; src?: string | null; signed?: boolean }) {
  const name = photo ?? theme;
  const file = EXTENSIONS.map((ext) => `hero/${name}.${ext}`).find((f) => existsSync(path.join(process.cwd(), "public", f)));
  const url = src || (file ? `/${file}` : null);
  return (
    <div aria-hidden="true" className={`hero-art ${url ? "has-photo" : ""}`}>
      {url && signed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" fetchPriority="high" decoding="async" />
      ) : (
        url && <Image src={url} alt="" fill priority sizes="(max-width: 860px) 100vw, 72vw" />
      )}
      {url && <div className="tint" />}
      <div className="bloom" />
      <div className="flutes" />
      <div className="fade" />
    </div>
  );
}
