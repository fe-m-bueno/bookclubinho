import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Em dev o MinIO roda em localhost (IP privado) — desativa otimização server-side
    // para evitar "upstream image resolved to private ip". Em prod usa Cloudflare R2.
    unoptimized: process.env.NODE_ENV !== "production",
    remotePatterns: [
      // Local MinIO (dev)
      {
        protocol: "http",
        hostname: "localhost",
        port: "9000",
      },
      // Cloudflare R2 public bucket (prod)
      {
        protocol: "https",
        hostname: "**.r2.dev",
      },
      // Custom R2 public domain, se configurado
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_R2_PUBLIC_HOSTNAME || "cdn.bookclubinho.com",
      },
      // Hardcover book covers
      {
        protocol: "https",
        hostname: "**.hardcover.app",
      },
      {
        protocol: "https",
        hostname: "**.cloudflare.com",
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
