"use client";

import { Analytics as VercelAnalytics, type BeforeSendEvent } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: page-view counts with no cookies and no stored IP address.
 * The widget lives in a frame on other people's sites and reports nothing.
 * The cookie notice and the /cookies and /privacy pages describe this; keep them in step.
 */
export function Analytics() {
  return <VercelAnalytics beforeSend={dropEmbed} />;
}

function dropEmbed(event: BeforeSendEvent): BeforeSendEvent | null {
  return new URL(event.url).pathname.startsWith("/embed") ? null : event;
}
