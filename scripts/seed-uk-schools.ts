/**
 * Seeds `schools` from the four official UK registers, so the school browser
 * lists every school in the country rather than the ones users have typed in.
 *
 *   England + Wales  Get Information About Schools (DfE), published daily
 *   Scotland         Scottish School Roll and Locations (Scottish Government)
 *   Northern Ireland School-level reference data (Department of Education NI)
 *
 * Every id is a deterministic UUIDv5 of `<source>:<reference>`, so re-running is
 * idempotent: a school that has been renamed or has a new head is updated in
 * place and keeps the id any teacher is already attached to. Do not change the
 * NAMESPACE constant -- every seeded id depends on it.
 *
 *   bun --env-file=.env.local run scripts/seed-uk-schools.ts
 *   bun --env-file=.env.local run scripts/seed-uk-schools.ts --dry-run
 *   bun --env-file=.env.local run scripts/seed-uk-schools.ts --refresh   # re-download
 *
 * Only GIAS records a headteacher, and only GIAS and Scotland record a domain.
 * A school with no domain cannot be claimed online; its teachers reach the
 * platform admin through platform_admin_queue() instead. See the migration
 * 20260904000000_uk_school_register.sql for that half.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { parseCsv, readXlsxSheets, readZipEntries, toRecords } from './lib/tabular';
import { schoolDomains } from '../src/lib/schools/domain';

const DRY_RUN = process.argv.includes('--dry-run');
const REFRESH = process.argv.includes('--refresh');

/** Fixed namespace so ids never move. Do not change it. */
const NAMESPACE = 'b7c1e3d9-4a25-4f18-9d6e-2c8b0f5a71e4';

const uuidv5 = (name: string): string => {
  const namespaceBytes = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(Buffer.concat([namespaceBytes, Buffer.from(name, 'utf8')])).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

type Nation = 'england' | 'wales' | 'scotland' | 'northern-ireland';
type Source = 'gias' | 'scotgov' | 'deni';

interface SchoolRow {
  id: string;
  source: Source;
  urn: string;
  name: string;
  nation: Nation;
  town: string | null;
  postcode: string | null;
  local_authority: string | null;
  phase: string | null;
  website: string | null;
  domains: string[];
  head_name: string | null;
  status: 'approved';
}

// ---------------------------------------------------------------------------
// Download, with a cache so iterating on the normalisers does not re-pull 64 MB
// ---------------------------------------------------------------------------

const CACHE_DIR = join(tmpdir(), 'aidemic-uk-schools');

async function fetchCached(url: string, cacheKey: string): Promise<Buffer> {
  const path = join(CACHE_DIR, cacheKey);
  if (!REFRESH && existsSync(path)) return readFileSync(path);

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(path, buffer);
  return buffer;
}

const clean = (value: string | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

// ---------------------------------------------------------------------------
// England and Wales -- Get Information About Schools
// ---------------------------------------------------------------------------

/**
 * The DfE republishes under today's date, but not from midnight, so walk back
 * until a day's file exists rather than failing for anyone running this early.
 */
async function fetchGias(): Promise<Buffer> {
  const errors: string[] = [];
  for (let daysAgo = 0; daysAgo < 7; daysAgo += 1) {
    const day = new Date(Date.now() - daysAgo * 86_400_000);
    const stamp = `${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}${String(day.getUTCDate()).padStart(2, '0')}`;
    try {
      return await fetchCached(
        `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${stamp}.csv`,
        `gias-${stamp}.csv`
      );
    } catch (error) {
      errors.push(`${stamp}: ${(error as Error).message}`);
    }
  }
  throw new Error(`No GIAS extract found in the last 7 days.\n${errors.join('\n')}`);
}

function parseGias(buffer: Buffer): SchoolRow[] {
  // GIAS is Windows-1252: school names carry curly apostrophes and accents that
  // UTF-8 decoding turns into replacement characters.
  const records = toRecords(parseCsv(new TextDecoder('windows-1252').decode(buffer)));

  const open = records.filter(
    (record) =>
      record['EstablishmentStatus (name)']?.startsWith('Open') &&
      // A university is never the answer to "which school do you teach at", and
      // its presence would only crowd the search results.
      record['EstablishmentTypeGroup (name)'] !== 'Universities'
  );

  // GIAS files Welsh establishments under their own type group. Deriving the
  // Welsh local authorities from that group rather than hard-coding 22 names
  // keeps the handful of Welsh rows filed under other groups on the right side.
  //
  // Placeholder LA names are excluded. GIAS uses "Not applicable" / "Unknown"
  // for a minority of establishments in every nation, so a single Welsh row
  // carrying one would put that placeholder in the set and file every English
  // school sharing it under Wales.
  const NON_GEOGRAPHIC_LA = new Set(['not applicable', 'unknown', 'does not apply', '']);
  const welshAuthorities = new Set(
    open
      .filter((record) => record['EstablishmentTypeGroup (name)'] === 'Welsh schools')
      .map((record) => record['LA (name)'])
      .filter((la): la is string => Boolean(la) && !NON_GEOGRAPHIC_LA.has(la.trim().toLowerCase()))
  );

  return open.flatMap((record) => {
    const urn = clean(record.URN);
    const name = clean(record.EstablishmentName);
    if (!urn || !name) return [];

    const localAuthority = clean(record['LA (name)']);
    const nation: Nation =
      record['EstablishmentTypeGroup (name)'] === 'Welsh schools' ||
      (localAuthority !== null && welshAuthorities.has(localAuthority))
        ? 'wales'
        : 'england';

    const website = clean(record.SchoolWebsite);
    // Only recorded when the SURNAME is known. platform_admin_queue() compares
    // the last token of this against the last token of the claimant's profile
    // name, so a forename-only record ("Jane") would be compared as a surname:
    // a guaranteed false negative for the real head, and a false positive for
    // any teacher whose surname happens to be someone else's forename.
    const headLast = clean(record.HeadLastName);
    const head = headLast ? [clean(record.HeadFirstName), headLast].filter(Boolean).join(' ') : '';

    return [
      {
        id: uuidv5(`gias:${urn}`),
        source: 'gias' as const,
        urn,
        name,
        nation,
        town: clean(record.Town),
        postcode: clean(record.Postcode),
        local_authority: localAuthority,
        phase: clean(record['PhaseOfEducation (name)']),
        website,
        domains: schoolDomains([website]),
        head_name: head === '' ? null : head,
        status: 'approved' as const,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Scotland -- Scottish School Roll and Locations
//
// The gov.scot "school level summary statistics" workbook covers the same
// schools but publishes no address, website or contact address, so it cannot
// support either the browser's disambiguation or a domain-matched claim. This
// dataset is publicly funded schools only; independent schools are not in any
// Scottish open register and fall to the platform admin queue.
// ---------------------------------------------------------------------------

function parseScotlandSheet(rows: string[][]): SchoolRow[] {
  const records = toRecords(rows);

  return records.flatMap((record) => {
    const urn = clean(record.SeedCode);
    const name = clean(record.SchoolName);
    if (!urn || !name) return [];

    const website = clean(record.Website);
    return [
      {
        id: uuidv5(`scotgov:${urn}`),
        source: 'scotgov' as const,
        urn,
        name,
        nation: 'scotland' as const,
        // AddressLine3 is the town when there is a street on lines 1-2.
        town: clean(record.AddressLine3) ?? clean(record.AddressLine2),
        postcode: clean(record.PostCode),
        local_authority: clean(record.LAName),
        phase: clean(record.SchoolType),
        website,
        domains: schoolDomains([website, clean(record.Email)]),
        head_name: null,
        status: 'approved' as const,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Northern Ireland -- school-level reference data
//
// Published one workbook per phase, each with a "Reference Data" sheet whose
// header sits below a couple of title rows. No website, contact address or
// principal is published, so no NI school can be claimed online.
// ---------------------------------------------------------------------------

const NI_WORKBOOKS: Record<string, string> = {
  primary: 'https://www.education-ni.gov.uk/sites/default/files/2026-07/School%20level%20-%20primary%20schools%20202526%20supp_1.xlsx',
  'post-primary': 'https://www.education-ni.gov.uk/sites/default/files/2026-07/School%20level%20-%20post%20primary%20schools%20202526%20supp_1.xlsx',
  nursery: 'https://www.education-ni.gov.uk/sites/default/files/2026-07/School%20level%20-%20nursery%20schools%20202526%20supp_1.xlsx',
  special: 'https://www.education-ni.gov.uk/sites/default/files/2026-03/School%20level%20-%20special%20schools%20202526.xlsx',
};

function parseNorthernIreland(rows: string[][], phase: string): SchoolRow[] {
  const headerIndex = rows.findIndex((row) => row.some((cell) => cell.toLowerCase() === 'deni ref'));
  if (headerIndex < 0) return [];
  const records = toRecords(rows, headerIndex);

  return records.flatMap((record) => {
    const urn = clean(record['DENI ref']);
    const rawName = clean(record['School name']);
    if (!urn || !rawName) return [];

    const town = clean(record.Town);
    // DE NI appends the town to the name ("Belmont Primary School, Belfast");
    // the browser shows the town in its own column, so drop the repetition.
    const name = town && rawName.toLowerCase().endsWith(`, ${town.toLowerCase()}`)
      ? rawName.slice(0, -(town.length + 2)).trim()
      : rawName;

    return [
      {
        id: uuidv5(`deni:${urn}`),
        source: 'deni' as const,
        urn,
        name,
        nation: 'northern-ireland' as const,
        town,
        postcode: clean(record.Postcode),
        local_authority: clean(record['District Council (2014)']),
        phase: clean(record['School Type']) ?? phase,
        website: null,
        domains: [],
        head_name: null,
        status: 'approved' as const,
      },
    ];
  });
}

// ---------------------------------------------------------------------------

async function collect(): Promise<SchoolRow[]> {
  const rows: SchoolRow[] = [];

  console.log('Fetching GIAS (England + Wales)...');
  rows.push(...parseGias(await fetchGias()));

  console.log('Fetching Scottish School Roll and Locations...');
  const scotlandZip = await fetchCached('https://maps.gov.scot/ATOM/shapefiles/SG_SchoolRoll_2023_Table.zip', 'scotland.zip');
  // The published resource is a zip whose single entry is itself an xlsx, so it
  // needs unwrapping once before the sheet reader sees a workbook.
  const workbook = [...readZipEntries(scotlandZip)].find(([name]) => name.toLowerCase().endsWith('.xlsx'))?.[1];
  if (!workbook) throw new Error('No .xlsx inside the Scottish school roll archive');
  rows.push(...parseScotlandSheet([...readXlsxSheets(workbook).values()][0] ?? []));

  for (const [phase, url] of Object.entries(NI_WORKBOOKS)) {
    console.log(`Fetching DE NI ${phase} schools...`);
    const sheets = readXlsxSheets(await fetchCached(url, `deni-${phase}.xlsx`));
    rows.push(...parseNorthernIreland(sheets.get('Reference Data') ?? [], phase));
  }

  // A school appearing in two NI workbooks (a primary with a nursery unit) must
  // not be upserted twice in one batch -- Postgres rejects a statement that
  // touches the same row more than once.
  const byId = new Map<string, SchoolRow>();
  for (const row of rows) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()];
}

/**
 * The floor each register has to clear before anything is written.
 *
 * A parser that harvests zero rows is this script's characteristic failure: a
 * BOM in the header, a renamed column, a blank row above the header, an .xlsx
 * relationship attribute in an unexpected order. All of them produce an empty
 * result rather than an exception, and because the upsert never deletes, a
 * partial run leaves the table looking healthy while quietly half-stale.
 *
 * These are roughly 80% of what each register publishes today (GIAS ~27,081 for
 * England and Wales together, Scotland ~2,449, DE NI ~1,098). A genuine drop
 * below one of them would be a national school closure programme; in practice it
 * means the parser broke.
 */
const MINIMUM_ROWS: Record<Source, number> = {
  gias: 21000,
  scotgov: 1900,
  deni: 850,
};

async function main() {
  const rows = await collect();

  const byNation = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.nation] = (counts[row.nation] ?? 0) + 1;
    return counts;
  }, {});
  const bySource = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.source] = (counts[row.source] ?? 0) + 1;
    return counts;
  }, {});
  const claimable = rows.filter((row) => row.domains.length > 0).length;

  console.log(`\n${rows.length} schools`);
  for (const [nation, count] of Object.entries(byNation).sort()) console.log(`  ${nation.padEnd(18)} ${count}`);
  // Guarded: rows.length is 0 when every register fails, and the percentage was
  // printed as NaN on the way to upserting nothing.
  const claimablePct = rows.length > 0 ? Math.round((claimable / rows.length) * 100) : 0;
  console.log(`  ${'claimable online'.padEnd(18)} ${claimable} (${claimablePct}%)`);
  console.log(`  ${'with headteacher'.padEnd(18)} ${rows.filter((row) => row.head_name).length}`);

  const shortfalls = (Object.keys(MINIMUM_ROWS) as Source[])
    .map((source) => ({ source, got: bySource[source] ?? 0, want: MINIMUM_ROWS[source] }))
    .filter((entry) => entry.got < entry.want);

  if (shortfalls.length > 0) {
    console.error(`\n${DRY_RUN ? 'WARNING' : 'Refusing to write'}: a register parsed to implausibly few rows.`);
    for (const { source, got, want } of shortfalls) {
      console.error(`  ${source.padEnd(10)} ${got} rows, expected at least ${want}`);
    }
    console.error('\nThis is almost always a parser problem (a changed column name, a BOM,');
    console.error('a shifted header row) rather than a real change in the register.');
    // A dry run reports and carries on: it writes nothing anyway, and exiting
    // here would break the one command that can actually diagnose the shortfall.
    if (!DRY_RUN) {
      console.error('Run with --dry-run --refresh to re-download and inspect.');
      process.exit(1);
    }
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: nothing written.');
    console.log(rows.slice(0, 3));
    return;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // An upsert replaces the whole row, so a hard-coded status: 'approved' quietly
  // reinstated any school a platform admin had rejected, on every re-seed. Only
  // the exceptions need looking up -- approved is both the default and the norm.
  const { data: overridden, error: statusError } = await supabase
    .from('schools')
    .select('id, status')
    .neq('status', 'approved');
  if (statusError) {
    console.error(`\nCould not read existing school statuses: ${statusError.message}`);
    process.exit(1);
  }
  const statusById = new Map<string, 'pending' | 'approved' | 'rejected'>(
    (overridden ?? []).map((row) => [row.id as string, row.status as 'pending' | 'rejected'])
  );
  if (statusById.size > 0) {
    console.log(`Preserving ${statusById.size} manually-set school status(es).`);
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((row) => ({ ...row, status: statusById.get(row.id) ?? row.status }));
    const { error } = await supabase.from('schools').upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`\nBatch at ${i} failed: ${error.message}`);
      process.exit(1);
    }
    process.stdout.write(`\rUpserted ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log('\nDone.');
}

void main();
