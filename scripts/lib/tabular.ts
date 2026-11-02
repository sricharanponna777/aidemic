/**
 * Minimal readers for the two shapes the official school registers ship in:
 * a quoted CSV (DfE) and an .xlsx workbook (Scottish Government, DE NI).
 *
 * These exist so seeding the UK school register does not pull a spreadsheet
 * library into the app's dependency tree for a script that runs a few times a
 * year. They handle exactly what those files contain -- no formulas, no dates,
 * no zip64, no encryption.
 */

import { inflateRawSync } from 'node:zlib';

/** RFC 4180: quoted fields, "" escapes, newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A BOM would otherwise become part of the first header name -- and because
  // every lookup is by header name, that is not a cosmetic problem: `record.URN`
  // would be undefined for every row and parseGias would return zero schools
  // without raising anything.
  //
  // Two forms have to be handled. U+FEFF is what a UTF-8 BOM decodes to when the
  // bytes are read as UTF-8; 'ï»¿' is what the same three bytes decode to as
  // windows-1252, which is how GIAS is read (see parseGias). The original check
  // caught only the first, i.e. never the one that could actually occur here.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  else if (text.startsWith('ï»¿')) text = text.slice(3);

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows keyed by the header row, which is not always row 0 in a stats workbook. */
export function toRecords(rows: string[][], headerIndex = 0): Record<string, string>[] {
  const header = (rows[headerIndex] ?? []).map((h) => h.trim());
  return rows.slice(headerIndex + 1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, i) => {
      if (key) record[key] = (row[i] ?? '').trim();
    });
    return record;
  });
}

// ---------------------------------------------------------------------------
// xlsx
// ---------------------------------------------------------------------------

export type ZipEntries = Map<string, Buffer>;

/**
 * Reads a zip through its central directory rather than by scanning for local
 * headers -- an entry written with a streaming data descriptor has a zeroed
 * size in its local header, and the central directory always has the real one.
 */
export function readZipEntries(buffer: Buffer): ZipEntries {
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 22 - 65536; i -= 1) {
    if (buffer.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file (no end-of-central-directory record)');

  const count = buffer.readUInt16LE(eocd + 10);
  let pointer = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntries = new Map();

  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) throw new Error('Corrupt central directory');
    const method = buffer.readUInt16LE(pointer + 10);
    const compressedSize = buffer.readUInt32LE(pointer + 20);
    const nameLength = buffer.readUInt16LE(pointer + 28);
    const extraLength = buffer.readUInt16LE(pointer + 30);
    const commentLength = buffer.readUInt16LE(pointer + 32);
    const localOffset = buffer.readUInt32LE(pointer + 42);
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength);

    // The local header's own name/extra lengths are the authoritative ones for
    // finding where the data starts; the central copy of extra may differ.
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(start, start + compressedSize);

    entries.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity] ?? match;
  });
}

/** "BC" -> 54. Cells carry their address, so a blank cell is simply absent. */
function columnIndex(reference: string): number {
  const letters = reference.replace(/[^A-Z]/g, '');
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function sharedStrings(entries: ZipEntries): string[] {
  const xml = entries.get('xl/sharedStrings.xml')?.toString('utf8');
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    // An <si> may be split across several <t> runs by formatting.
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((run) => decodeXml(run[1])).join('')
  );
}

/**
 * Every sheet in the workbook, in workbook order, as a grid of trimmed strings.
 * Numbers come back in their stored form, which is what these registers use for
 * reference codes ("1010012") and rolls.
 */
export function readXlsxSheets(buffer: Buffer): Map<string, string[][]> {
  const entries = readZipEntries(buffer);
  const strings = sharedStrings(entries);

  const workbook = entries.get('xl/workbook.xml')?.toString('utf8') ?? '';
  const rels = entries.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '';

  // Id and Target are read independently rather than in one pattern that requires
  // Id to come first. XML attribute order is not significant, and a producer that
  // emits Target before Id would have matched nothing -- leaving every sheet empty
  // and the whole register parsing to zero rows without an error.
  const targetByRelId = new Map<string, string>();
  for (const match of rels.matchAll(/<Relationship\b[^>]*?\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1];
    if (!id || !target) continue;
    targetByRelId.set(id, target.replace(/^\/?(xl\/)?/, ''));
  }

  const sheets = new Map<string, string[][]>();
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const name = /name="([^"]*)"/.exec(match[0])?.[1];
    const relId = /r:id="([^"]*)"/.exec(match[0])?.[1];
    if (!name || !relId) continue;
    const path = targetByRelId.get(relId);
    const xml = path ? entries.get(`xl/${path}`)?.toString('utf8') : undefined;
    sheets.set(decodeXml(name), xml ? parseSheet(xml, strings) : []);
  }
  return sheets;
}

function parseSheet(xml: string, strings: string[]): string[][] {
  const rows: string[][] = [];

  for (const rowMatch of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? '');
    const row: string[] = [];
    for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1];
      const body = cellMatch[2] ?? '';
      const reference = /r="([A-Z]+)\d+"/.exec(attributes)?.[1];
      const type = /t="([^"]*)"/.exec(attributes)?.[1];

      let value = '';
      if (type === 's') {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
        value = strings[index] ?? '';
      } else if (type === 'inlineStr') {
        value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((run) => decodeXml(run[1])).join('');
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? '');
      }

      const index = reference ? columnIndex(reference) : row.length;
      while (row.length < index) row.push('');
      row[index] = value.trim();
    }

    // Placed at its own sheet row, not appended in document order. Excel omits
    // fully-empty rows from the XML entirely, so appending collapsed the grid
    // upward: any blank row above the header shifted every later row, and
    // toRecords(rows, headerIndex) then indexed a compacted array rather than
    // the sheet. parseScotlandSheet passes a hard-coded headerIndex of 0, so it
    // would silently bind to whatever the first non-empty row happened to be.
    if (Number.isInteger(rowNumber) && rowNumber >= 1) {
      while (rows.length < rowNumber - 1) rows.push([]);
      rows[rowNumber - 1] = row;
    } else {
      rows.push(row);
    }
  }

  return rows;
}
