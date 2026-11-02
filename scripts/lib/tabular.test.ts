import { describe, expect, it } from 'vitest';
import { parseCsv, toRecords } from './tabular';

/**
 * These pin the two ways the register parsers used to harvest zero rows without
 * raising anything -- the worst failure mode here, because seed-uk-schools.ts
 * would then upsert nothing, print "Done." and exit 0.
 */
describe('parseCsv BOM handling', () => {
  it('strips a UTF-8 BOM that was decoded as windows-1252, which is how GIAS is read', () => {
    // The three bytes EF BB BF decode to these three characters under
    // windows-1252. The old check only looked for U+FEFF, i.e. the UTF-8
    // decoding, which this file can never produce.
    const csv = 'ï»¿URN,Name\r\n100000,Abbey School\r\n';
    const records = toRecords(parseCsv(csv));
    expect(records[0]!.URN).toBe('100000');
    expect(records[0]!.Name).toBe('Abbey School');
  });

  it('still strips a real U+FEFF for UTF-8 callers', () => {
    const records = toRecords(parseCsv('﻿URN,Name\n100001,Millfield\n'));
    expect(records[0]!.URN).toBe('100001');
  });

  it('leaves a header alone when there is no BOM', () => {
    const records = toRecords(parseCsv('URN,Name\n100002,Oak\n'));
    expect(records[0]!.URN).toBe('100002');
  });

  it('keeps quoted fields containing commas and newlines intact', () => {
    const rows = parseCsv('URN,Name\n1,"Abbey, The\nSecond line"\n');
    expect(rows[1]).toEqual(['1', 'Abbey, The\nSecond line']);
  });
});

describe('toRecords', () => {
  it('keys off the header row wherever it sits, and pads short rows', () => {
    const rows = [
      [],
      ['DENI ref', 'School name', 'District'],
      ['1234', 'St Marys'],
    ];
    const records = toRecords(rows, 1);
    expect(records[0]).toEqual({ 'DENI ref': '1234', 'School name': 'St Marys', District: '' });
  });
});
