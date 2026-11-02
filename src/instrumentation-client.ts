import * as Sentry from '@sentry/nextjs';

// Browser-side Sentry. With NEXT_PUBLIC_SENTRY_DSN unset this is a no-op, so
// local development and forks run without a Sentry project.
//
// Events go to the same-origin tunnel route set in next.config.ts, which is why
// the CSP's connect-src needs no Sentry host. Replay's compression worker is
// created from a blob: URL, which WORKER_SRC in src/lib/csp.ts already allows.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  // No `dataCollection`: the v11 default collects everything (user info,
  // cookies, headers, query params, request/response bodies), which is the
  // full-PII setting chosen for this project.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  // Record a replay only for sessions that hit an error.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    // These are the SDK defaults, stated so nobody turns them off by accident:
    // pages show students' answers, and the paper pages show photos of their
    // handwriting, none of which belongs in a replay.
    Sentry.replayIntegration({ maskAllText: true, maskAllInputs: true, blockAllMedia: true }),
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
