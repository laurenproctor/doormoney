"use client";
import { useEffect, useRef, useState } from "react";
import { embedPath } from "@/lib/fundraiser-identity";

/**
 * Frames /embed/[slug] the way embed.js does on an organizer's own site, including the resize message.
 * With a `fundraiserId` the frame is that exact fundraiser, which is what a fundraiser's own page
 * must pass: a page about one fundraiser never frames a widget that takes money for another.
 * Without one it is the profile-based compatibility widget, which only the demo uses.
 * `source` tells the embed where the backing came from; it is a backings.source column value, so it
 * still says "board" when the fundraiser's own page is the thing framing it.
 */
export function WidgetFrame({
  slug,
  fundraiserId,
  actName,
  source = "widget",
  theme,
}: {
  slug: string;
  fundraiserId?: string | null;
  actName: string;
  source?: "widget" | "board";
  /** The page's own light, so the frame matches what is around it. */ theme?: string;
}) {
  const src = embedPath(slug, fundraiserId, { source: source === "board" ? "board" : undefined, theme });
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(560);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const d = e.data || {};
      if (d.type === "doormoney:height" && d.height) setHeight(d.height);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      src={src}
      title={`Back ${actName} on Door Money`}
      allow="payment"
      style={{ height }}
      className="mx-auto block w-full max-w-[400px] border-0"
    />
  );
}
