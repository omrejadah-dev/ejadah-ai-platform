import os from "node:os";
import type { NextConfig } from "next";

/** Dev only: let other machines on the LAN open the dev server (e.g. http://192.168.1.212:3000). Extra hosts: ALLOWED_DEV_ORIGINS=a,b */
function lanDevOrigins(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1"]);
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const n of ifaces ?? []) if (n.family === "IPv4" && !n.internal) hosts.add(n.address);
  for (const h of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) if (h.trim()) hosts.add(h.trim());
  return [...hosts];
}

const apiUpstream = process.env.API_UPSTREAM_URL ?? "http://127.0.0.1:5020";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: lanDevOrigins(),
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
