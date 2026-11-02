/**
 * Deriving the set of hostnames that count as "official" for a school.
 *
 * A headteacher claim is gated on the claimant's email domain matching one of
 * these (see claim_school_admin() in migration 20260904000000). The comparison
 * itself lives in SQL, so nothing here is duplicated there -- this module only
 * decides what goes into schools.domains at seed time, from whatever the
 * official register happens to publish: a website URL for England and Wales, a
 * website and a contact address for Scotland, neither for Northern Ireland.
 */

/**
 * Hosts a school's *own* domain can never be, however the register spells it.
 * A school whose recorded website is a Facebook page or a council directory
 * entry must fall through to manual verification rather than handing school
 * admin to everyone with an address at that provider.
 *
 * Matched as a SUFFIX, not by equality. Every genuinely multi-tenant host here is
 * used as a subdomain in the wild -- stmarys.glowscotland.org.uk,
 * myschool.wixsite.com, aschool.eschools.co.uk -- so an exact-match Set let all
 * of them through into schools.domains. Paired with the SQL gate that also
 * matched a school domain against a *parent* of the claimant's, that meant any
 * holder of a @glowscotland.org.uk address could claim any Glow-hosted school.
 */
const NON_SCHOOL_HOSTS = new Set([
  'gmail.com',
  'googlemail.com',
  'google.com',
  'sites.google.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'live.co.uk',
  'yahoo.com',
  'yahoo.co.uk',
  'aol.com',
  'btinternet.com',
  'icloud.com',
  'me.com',
  'facebook.com', // covers www. and any tenant subdomain via the suffix match below
  'twitter.com',
  'x.com',
  'wordpress.com',
  'wix.com',
  'wixsite.com',
  'weebly.com',
  'blogspot.com',
  'blogspot.co.uk',
  'sharepoint.com',
  'glowscotland.org.uk',
  'blogs.glowscotland.org.uk',
  'eschools.co.uk',
  'secure-primarysite.net',
  'primarysite.net',
]);

/**
 * Public suffixes that must never stand alone as a domain. Without this,
 * a malformed record like "http://sch.uk" would match every .sch.uk address in
 * the country.
 */
const PUBLIC_SUFFIXES = new Set([
  'uk',
  'co.uk',
  'org.uk',
  'sch.uk',
  'ac.uk',
  'gov.uk',
  'net.uk',
  'ltd.uk',
  'plc.uk',
  'com',
  'org',
  'net',
  'edu',
  'scot',
  'wales',
  'cymru',
]);

/** True when `host` is one of the shared hosts above, or sits beneath one. */
function isNonSchoolHost(host: string): boolean {
  for (const blocked of NON_SCHOOL_HOSTS) {
    if (host === blocked || host.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/** The host of a website URL or an email address, lowercased, `www.` stripped. */
export function hostOf(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;

  // Email addresses arrive from the Scottish register in the same column shape
  // as URLs do elsewhere, so handle both here rather than at each call site.
  //
  // Only when the value actually looks like a bare address, though. A GIAS
  // SchoolWebsite carrying an '@' after the host (a mailto: in the path, a
  // tracking parameter) used to be sliced down to the fragment after the last
  // '@', which usually has no dot and so returned null -- silently costing that
  // school its only recorded domain and making it unclaimable.
  const looksLikeEmail = raw.includes('@') && !raw.includes('://') && !raw.includes('/');
  const afterAt = looksLikeEmail ? raw.slice(raw.lastIndexOf('@') + 1) : raw;

  const host = afterAt
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/^\/\//, '')
    .split(/[/?#\\]/)[0]
    .split(':')[0]
    .replace(/^www\./i, '')
    .replace(/\.+$/, '')
    .trim()
    .toLowerCase();

  if (!host || !host.includes('.')) return null;
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.split('.').some((label) => label === '')) return null;
  if (PUBLIC_SUFFIXES.has(host)) return null;
  if (isNonSchoolHost(host)) return null;

  return host;
}

/**
 * The domains a claim may be made from, de-duplicated and ordered so the result
 * is stable across re-seeds. Empty means the school cannot be claimed online --
 * a real outcome for every DE NI school and for English schools with no website
 * in GIAS, both of which route to the platform admin queue instead.
 */
export function schoolDomains(values: (string | null | undefined)[]): string[] {
  const hosts = values.map(hostOf).filter((host): host is string => host !== null);
  return [...new Set(hosts)].sort();
}
