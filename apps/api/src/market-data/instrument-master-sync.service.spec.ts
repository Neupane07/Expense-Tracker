import { InstrumentLifecycleStatus } from '../generated/prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDhanInstrumentMasterCsv } from './dhan-instrument-master.parser';
import { InstrumentMasterSyncService } from './instrument-master-sync.service';

describe('InstrumentMasterSyncService lifecycle rules', () => {
  const service = new InstrumentMasterSyncService({} as never, {} as never);
  const rows = parseDhanInstrumentMasterCsv(
    readFileSync(
      join(__dirname, 'fixtures', 'dhan-instrument-master.sample.csv'),
      'utf8',
    ),
  ).rows;

  it('marks ISIN renames and duplicate symbol conflicts deterministically', () => {
    const lifecycle = service.applyLifecycleRules(rows);

    const oldSymbol = lifecycle.rows.find((row) => row.symbol === 'OLDSYM');
    const newSymbol = lifecycle.rows.find((row) => row.symbol === 'NEWSYM');
    const duplicates = lifecycle.rows.filter((row) => row.symbol === 'DUPA');
    const delisted = lifecycle.rows.find((row) => row.symbol === 'DELIST');

    expect(oldSymbol?.lifecycleStatus).toBe(InstrumentLifecycleStatus.RENAMED);
    expect(oldSymbol?.supersededBySymbol).toBe('NEWSYM');
    expect(newSymbol?.lifecycleStatus).toBe(InstrumentLifecycleStatus.ACTIVE);
    expect(
      duplicates.every(
        (row) => row.lifecycleStatus === InstrumentLifecycleStatus.INACTIVE,
      ),
    ).toBe(true);
    expect(delisted?.lifecycleStatus).toBe(InstrumentLifecycleStatus.DELISTED);
    expect(lifecycle.conflictCount).toBeGreaterThan(0);
  });
});
