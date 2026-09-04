import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { listOpenBoards } from "@/lib/boards";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = ["", "/placements", "/auctions", "/widget", "/list", "/contact", "/terms", "/refunds", "/privacy", "/cookies", "/accessibility"];
  const boards = await listOpenBoards();
  return [
    ...pages.map((p) => ({ url: `${SITE.url}${p}`, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...boards.map((b) => ({ url: `${SITE.url}/board/${b.act.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
