import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached through the gated staging tunnel origin. Next 16's dev
  // cross-origin protection otherwise rejects HMR / internal dev requests from a non-localhost
  // origin, which breaks client hydration when the app is served via cloudflared at
  // staging.fieldroute.io — leaving ProductIntake stuck in boot.phase "loading". Dev-only setting.
  allowedDevOrigins: ["staging.fieldroute.io"],

  // Staging serves a `next dev` build behind Cloudflare. Dev chunk URLs are stably named, so a cached
  // chunk can survive a rebuild and keep serving STALE client UI even after the origin is fixed (this is
  // what made the owner see old cards after a code fix). Force `no-store` on every response so neither
  // the browser nor the Cloudflare edge caches staging assets — every load is fresh. Correct for a
  // staging/preview environment (caching is irrelevant; correctness is everything).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ];
  },
};

export default nextConfig;
