"use client";
import { useEffect, useRef, useState } from "react";

/**
 * The organizer's public photo on a card, and nothing when it cannot be shown.
 *
 * A plain image rather than next/image: the address is whatever the organizer's storage holds, and
 * the optimizer only fetches public storage paths on the configured host. The one thing this adds
 * is that a broken address takes the picture away rather than leaving a broken-image glyph in a
 * card. Nothing stands in for it: the card is text-led from then on, which is also what it is for
 * an organizer who added no photo.
 *
 * The image is in the server-rendered markup, so it may have already failed before React attaches
 * the error handler; the effect checks for that once on mount, which is the case the handler alone
 * would miss.
 *
 * `alt` is empty on purpose. The organizer's name is beside it in text, and the picture asserts
 * nothing about the work or its delivery.
 */
export function OrganizerPhoto({ src, frameClassName = "", className = "" }: { src: string; /** The crop the picture sits in. Goes with the picture when it fails, so no empty frame is left behind. */ frameClassName?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return null;
  return (
    <div className={frameClassName}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={ref} src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className={className} />
    </div>
  );
}
