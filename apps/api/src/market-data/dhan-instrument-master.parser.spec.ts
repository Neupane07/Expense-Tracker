import { parseDhanInstrumentMasterCsv } from './dhan-instrument-master.parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixturePath = join(
  __dirname,
  'fixtures',
  'dhan-instrument-master.sample.csv',
);

describe('parseDhanInstrumentMasterCsv', () => {
  it('parses NSE/BSE equity rows and ignores derivatives', () => {
    const text = readFileSync(fixturePath, 'utf8');
    const parsed = parseDhanInstrumentMasterCsv(text);

    expect(parsed.rows).toHaveLength(6);
    expect(parsed.rows.map((row) => row.symbol)).toEqual([
      'INFY',
      'OLDSYM',
      'NEWSYM',
      'DUPA',
      'DUPA',
      'DELIST',
    ]);
    expect(parsed.contentHash).toHaveLength(64);
  });

  it('normalizes ISIN and skips NA placeholders', () => {
    const text = readFileSync(fixturePath, 'utf8');
    const infy = parseDhanInstrumentMasterCsv(text).rows.find(
      (row) => row.symbol === 'INFY',
    );

    expect(infy?.isin).toBe('INE009A01021');
    expect(infy?.securityId).toBe('1594');
    expect(infy?.exchange).toBe('NSE');
  });
});
