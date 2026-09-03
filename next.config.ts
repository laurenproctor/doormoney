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
