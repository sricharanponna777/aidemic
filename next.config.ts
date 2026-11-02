import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// The Content-Security-Policy is NOT here: it carries a per-request nonce and so is
// built and set in src/proxy.ts (see src/lib/csp.ts). These are the headers whose
// values never change, which is why they can be attached statically.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // Browsers ignore HSTS over http/localhost, so this is safe to send everywhere.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
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

export default withSentryConfig(nextConfig, {
  // Source maps upload only when all three are set (e.g. in CI or on the host);
  // without them the build still succeeds, just with minified stack traces.
  // Uploaded maps are deleted from the build output so they are never served.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Same-origin, so the CSP's connect-src needs no Sentry host and ad blockers
  // don't drop events. proxy.ts runs on it but never redirects it: it is not
  // one of the prefixes requiresAuthCheck() gates.
  tunnelRoute: "/monitoring",
});
