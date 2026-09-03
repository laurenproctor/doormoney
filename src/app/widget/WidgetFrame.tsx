"use client";
import { useEffect, useRef, useState } from "react";

/** Frames /embed/[slug] the way embed.js does on an act's site, including the resize message. */
export function WidgetFrame({ slug, actName }: { slug: string; actName: string }) {
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
      src={`/embed/${slug}`}
      title={`Back ${actName} on Door Money`}
      allow="payment"
      style={{ height }}
      className="mx-auto block w-full max-w-[400px] border-0"
    />
  );
}
