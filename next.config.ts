import type { NextConfig } from "next";

// Allow same-origin plus the Supabase project (REST, Realtime websockets, Storage,
// and Edge Functions all live on *.supabase.co) for the connections the browser
// actually makes. AI calls go through same-origin API routes, so no AI provider
// origin is needed here. 'unsafe-inline'/'unsafe-eval' are required because the
// app (and Next) emit inline styles/scripts without a nonce pipeline; the CSP
// still adds real value via connect-src, frame-ancestors, base-uri, form-action.
const supabaseOrigins = "https://*.supabase.co wss://*.supabase.co";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins}`,
  `media-src 'self' blob: ${supabaseOrigins}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers ignore HSTS over http/localhost, so this is safe to send everywhere.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const nextConfig: NextConfig = {
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
