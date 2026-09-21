import type { NextConfig } from "next";

// Act photos live in Supabase Storage; next/image needs the host allowed before it will serve them.
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : null;
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: supabaseHost ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" }] : [],
  },
  experimental: {
    // Act photos come through a server action. Bucket cap is 5MB; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
  async redirects() {
    // The index lives at /fundraisers, the word the nav calls it. /auctions was its address first
    // and is in sent email and in snippets pasted on other people's sites, so it has to keep
    // arriving: addresses outlive words. The singular is what somebody types from memory.
    //
    // Temporary on purpose, as these always were: a browser caches a permanent redirect for good,
    // which is what made it safe to turn this one around. Make it permanent only once nobody
    // expects to turn it back.
    //
    // /api/cron/auctions is not a page and does not move. The database calls it from a URL held in
    // Vault (migration 0036), and a redirect there would cost the five-minute worker its header.
    //
    // Every source here has to be in RESERVED_SLUGS (src/lib/slug.ts) and in reserved_handles, or
    // an organizer could claim the name and never see their own page.
    return [
      { source: "/auctions", destination: "/fundraisers", permanent: false },
      { source: "/fundraiser", destination: "/fundraisers", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // The widget must be frameable by any origin.
        source: "/embed/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        // Everything else must not be framed.
        source: "/((?!embed).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
