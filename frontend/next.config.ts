import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const apiUrl =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const r2Hostname =
  process.env.NEXT_PUBLIC_R2_PUBLIC_HOSTNAME || "cdn.bookclubinho.com";

// Content-Security-Policy
// Iniciando em Report-Only para monitorar violações antes de enforçar.
// Mudar para "Content-Security-Policy" após validar no Sentry por 1-2 semanas.
const cspDirectives = [
  "default-src 'self'",
  // Next.js precisa de unsafe-inline para hidratação; unsafe-eval para dev HMR
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://*.r2.dev https://${r2Hostname} https://*.hardcover.app https://hardcover.app https://*.cloudflare.com`,
  `connect-src 'self' ${apiUrl} wss://${apiUrl.replace(/^https?:\/\//, "")} https://api.hardcover.app`,
  "font-src 'self'",
  `media-src 'self' https://*.r2.dev https://${r2Hostname}`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  // CSP em modo Report-Only — remover "-Report-Only" após validação
  {
    key: "Content-Security-Policy-Report-Only",
    value: cspDirectives,
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  // X-XSS-Protection desabilitado intencionalmente — CSP é a proteção correta
  {
    key: "X-XSS-Protection",
    value: "0",
  },
];

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
        hostname: r2Hostname,
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
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Desabilita source map upload se SENTRY_AUTH_TOKEN não estiver configurado
  silent: !process.env.SENTRY_AUTH_TOKEN,
});
