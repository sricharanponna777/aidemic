import * as Sentry from '@sentry/nextjs';

// Server and edge (proxy.ts) Sentry. Both runtimes take the same options; the
// package resolves to the right build for each. No-op without a DSN.
export function register() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    // No `dataCollection`: the v11 default collects everything (user info,
    // cookies, headers, query params, request/response bodies), which is the
    // full-PII setting chosen for this project.
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

// Errors thrown from Server Components, route handlers, server actions and the
// proxy. A route that catches its own error and returns a 500 never gets here.
export const onRequestError = Sentry.captureRequestError;
