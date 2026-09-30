"use client";

import { useState } from "react";
import type { UpdateMedia } from "@/lib/project-updates";

export function ProjectMedia({ media }: { media: UpdateMedia[] }) {
  return <div className="mt-8 grid gap-6">{media.map((m) => <Media key={m.id} item={m} />)}</div>;
}

function Media({ item }: { item: UpdateMedia }) {
  const [play, setPlay] = useState(false);
  if (item.kind === "image") return item.url ? <figure>
    {/* Private signed URLs are short-lived and cannot use the public image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={item.url} alt={item.alt ?? ""} className="max-h-[700px] w-full object-contain" />
    {item.caption && <figcaption className="mt-2 text-[14px] text-muted">{item.caption}</figcaption>}
  </figure> : null;
  if (item.kind === "video") return item.url ? <figure>
    <video src={item.url} controls preload="metadata" className="w-full" aria-label={item.caption ?? "Project video"} />
    {item.caption && <figcaption className="mt-2 text-[14px] text-muted">{item.caption}</figcaption>}
  </figure> : null;
  const url = item.provider === "youtube" ? `https://www.youtube-nocookie.com/embed/${item.videoId}`
    : item.provider === "vimeo" ? `https://player.vimeo.com/video/${item.videoId}` : null;
  if (!url) return null;
  return <figure>
    {play ? <iframe title={item.caption ?? "Project video"} src={url} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="aspect-video w-full border-0" />
      : <button type="button" onClick={() => setPlay(true)} className="aspect-video w-full bg-black px-6 text-center text-[16px] text-white underline underline-offset-4">Play video from {item.provider === "youtube" ? "YouTube" : "Vimeo"} (loads an external player)</button>}
    {item.caption && <figcaption className="mt-2 text-[14px] text-muted">{item.caption}</figcaption>}
  </figure>;
}
