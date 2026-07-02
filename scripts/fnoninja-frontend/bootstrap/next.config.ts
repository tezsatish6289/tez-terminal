import type { NextConfig } from "next";

const apiOrigin = process.env.FNONINJA_API_ORIGIN || "https://fnoninja.com";

const nextConfig: NextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://fnoninja.com https://www.fnoninja.com http://localhost:* https://localhost:*",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
