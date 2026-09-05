"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Frames /embed/[slug] the way embed.js does on a musician's own site, including the resize message.
 * `source` tells the embed where the backing came from; it is a backings.source column value, so it
 * still says "board" when the fundraiser's own page is the thing framing it.
 */
export function WidgetFrame({
  slug,
  actName,
  source = "widget",
  theme,
}: {
  slug: string;
  actName: string;
  source?: "widget" | "board";
  /** The page's own light, so the frame matches what is around it. */ theme?: string;
}) {
  const query = new URLSearchParams();
  if (source === "board") query.set("source", "board");
  if (theme) query.set("theme", theme);
  const qs = query.toString();
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
      src={`/embed/${slug}${qs ? `?${qs}` : ""}`}
      title={`Back ${actName} on Door Money`}
      allow="payment"
      style={{ height }}
      className="mx-auto block w-full max-w-[400px] border-0"
    />
  );
}
