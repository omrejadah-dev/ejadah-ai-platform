import type { NextConfig } from "next";

const apiUpstream = process.env.API_UPSTREAM_URL ?? "http://127.0.0.1:5020";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@platform/ui-kit"],
  experimental: { optimizePackageImports: ["@platform/ui-kit"] },
  // Same-origin API: the browser talks to /api/* on :3000 and Next proxies to ASP.NET (cookies stay first-party).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUpstream}/api/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
