import type { NextConfig } from "next";

// Security headers applied to every response.
// CSP allows the third-party endpoints the app actually talks to
// (OpenAI, Anthropic, Telegram, Meta, GHCR, Cloudflare images).
// 'unsafe-inline' / 'unsafe-eval' are required by Next.js for hydration and
// Turbopack dev; tightening further requires nonce-per-request work.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://api.openai.com https://api.anthropic.com https://api.telegram.org https://graph.facebook.com https://www.googleapis.com https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  // Standalone output: emit a self-contained server.js + minimal node_modules
  // under .next/standalone so the Docker runtime image stays small.
  output: "standalone",
  // Don't advertise framework / version to attackers.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
