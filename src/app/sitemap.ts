import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { listOpenBoards } from "@/lib/boards";
import { listPublishedUsernames } from "@/lib/patronprofile";
import { actUrl, runUrl } from "@/lib/urls";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/how-sponsorship-works", "/auctions", "/widget", "/list", "/contact", "/terms", "/refunds", "/privacy", "/cookies", "/accessibility"];
  const [boards, patrons] = await Promise.all([listOpenBoards(), listPublishedUsernames()]);
  return [
    ...pages.map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...boards.map((b) => ({ url: actUrl(b.act.slug), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...boards.map((b) => ({ url: runUrl(b.act.slug, b.run.slug), changeFrequency: "daily" as const, priority: 0.8 })),
    // Only profiles their patrons published. An unpublished one is not in the view at all.
    ...patrons.map((p) => ({ url: `${SITE.url}/patron/${p.username}`, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
