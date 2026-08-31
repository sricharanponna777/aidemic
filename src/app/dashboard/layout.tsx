import type { ReactNode } from 'react';
import DashboardShell from './DashboardShell';

/**
 * Server wrapper around the (client) dashboard shell, which exists so this segment
 * can opt into per-request rendering.
 *
 * The CSP in src/lib/csp.ts protects the authenticated app with a per-request nonce
 * instead of 'unsafe-inline', and Next can only stamp that nonce onto its inline
 * bootstrap scripts when the page is rendered per request -- a statically prerendered
 * page is built once, long before the nonce exists, so every script tag would be
 * missing it and the browser would block the whole app.
 *
 * Scoping it to /dashboard is the trade: these pages sit behind an auth check in
 * src/proxy.ts and were never CDN-cacheable, so little is lost, while the public
 * marketing pages stay static and keep the weaker (inline-allowing) policy.
 */
export const dynamic = 'force-dynamic';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
