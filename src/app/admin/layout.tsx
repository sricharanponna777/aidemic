import type { ReactNode } from 'react';
import AdminShell from './AdminShell';

/**
 * The school admin console. Its own top-level URL and shell rather than a corner
 * of /dashboard, because a school admin account is not a teacher, student or
 * parent and has no dashboard at all.
 *
 * force-dynamic for the same reason as src/app/dashboard/layout.tsx: /admin gets
 * the strict nonce CSP (usesStrictCsp in src/lib/csp.ts), and Next can only stamp
 * the nonce onto its bootstrap scripts on a page rendered per request. Remove it
 * and every admin page is prerendered without the nonce and the browser blanks it.
 */
export const dynamic = 'force-dynamic';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
