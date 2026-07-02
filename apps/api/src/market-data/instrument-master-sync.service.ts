import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InstrumentLifecycleStatus,
  InstrumentMasterSyncStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DHAN_SCRIP_MASTER_DETAILED_URL,
  DHAN_SCRIP_MASTER_SOURCE,
  INSTRUMENT_MASTER_STALE_HOURS,
} from './instrument-master.constants';
import {
  hashInstrumentMasterContent,
  parseDhanInstrumentMasterCsv,
  type DhanInstrumentMasterRow,
} from './dhan-instrument-master.parser';

type SyncOptions = {
  force?: boolean;
};

@Injectable()
export class InstrumentMasterSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async syncFromProvider(options: SyncOptions = {}) {
    const sourceUrl = this.resolveSourceUrl();
    const run = await this.prisma.instrumentMasterSyncRun.create({
      data: {
        status: InstrumentMasterSyncStatus.RUNNING,
        sourceUrl,
      },
    });

    try {
      const fetched = await this.fetchMasterCsv(sourceUrl);
      const parsed = parseDhanInstrumentMasterCsv(fetched.text);

      if (
        !options.force &&
        (await this.hasCompletedSyncWithHash(parsed.contentHash))
      ) {
        const completedAt = new Date();
        const skipped = await this.prisma.instrumentMasterSyncRun.update({
          where: { id: run.id },
          data: {
            status: InstrumentMasterSyncStatus.COMPLETED,
            contentHash: parsed.contentHash,
            completedAt,
            fetchedAt: fetched.fetchedAt,
            rowCount: parsed.rows.length,
            skippedCount: parsed.rows.length,
            rawMetadata: {
              idempotentSkip: true,
              byteLength: fetched.text.length,
              ...fetched.metadata,
            },
          },
        });

        return {
          run: skipped,
          idempotentSkip: true,
        };
      }

      const lifecycle = this.applyLifecycleRules(parsed.rows);
      const seenKeys = new Set<string>();
      let upsertedCount = 0;

      for (const row of lifecycle.rows) {
        const key = masterKey(row.exchange, row.securityId);
        seenKeys.add(key);

        await this.prisma.instrumentMasterEntry.upsert({
          where: {
            exchange_securityId: {
              exchange: row.exchange,
              securityId: row.securityId,
            },
          },
          create: {
            securityId: row.securityId,
            exchange: row.exchange,
            segment: row.segment,
            symbol: row.symbol,
            displayName: row.displayName,
            isin: row.isin,
            instrumentName: row.instrumentName,
            instrumentType: row.instrumentType,
            series: row.series,
            lifecycleStatus: row.lifecycleStatus,
            supersededBySymbol: row.supersededBySymbol,
            supersededBySecurityId: row.supersededBySecurityId,
            buySellIndicator: row.buySellIndicator,
            source: row.source,
            sourceRowHash: row.sourceRowHash,
            rawMetadata: row.rawMetadata,
            firstSeenAt: fetched.fetchedAt,
            lastSeenAt: fetched.fetchedAt,
          },
          update: {
            segment: row.segment,
            symbol: row.symbol,
            displayName: row.displayName,
            isin: row.isin,
            instrumentName: row.instrumentName,
            instrumentType: row.instrumentType,
            series: row.series,
            lifecycleStatus: row.lifecycleStatus,
            supersededBySymbol: row.supersededBySymbol,
            supersededBySecurityId: row.supersededBySecurityId,
            buySellIndicator: row.buySellIndicator,
            source: row.source,
            sourceRowHash: row.sourceRowHash,
            rawMetadata: row.rawMetadata,
            lastSeenAt: fetched.fetchedAt,
          },
        });

        upsertedCount += 1;
      }

      const deactivatedCount = await this.deactivateUnseenEntries(
        seenKeys,
        fetched.fetchedAt,
      );
      const completedAt = new Date();

      const updatedRun = await this.prisma.instrumentMasterSyncRun.update({
        where: { id: run.id },
        data: {
          status: InstrumentMasterSyncStatus.COMPLETED,
          contentHash: parsed.contentHash,
          completedAt,
          fetchedAt: fetched.fetchedAt,
          rowCount: parsed.rows.length,
          upsertedCount,
          deactivatedCount,
          conflictCount: lifecycle.conflictCount,
          rawMetadata: {
            byteLength: fetched.text.length,
            equityRowCount: parsed.rows.length,
            ...fetched.metadata,
          },
        },
      });

      return {
        run: updatedRun,
        idempotentSkip: false,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Instrument master sync failed';

      await this.prisma.instrumentMasterSyncRun.update({
        where: { id: run.id },
        data: {
          status: InstrumentMasterSyncStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new ServiceUnavailableException(message);
    }
  }

  async getLatestStatus() {
    return this.prisma.instrumentMasterSyncRun.findFirst({
      where: { status: InstrumentMasterSyncStatus.COMPLETED },
      orderBy: { completedAt: 'desc' },
    });
  }

  async getStatusSummary() {
    const latest = await this.getLatestStatus();
    const running = await this.prisma.instrumentMasterSyncRun.findFirst({
      where: { status: InstrumentMasterSyncStatus.RUNNING },
      orderBy: { startedAt: 'desc' },
    });
    const entryCount = await this.prisma.instrumentMasterEntry.count();
    const activeCount = await this.prisma.instrumentMasterEntry.count({
      where: { lifecycleStatus: InstrumentLifecycleStatus.ACTIVE },
    });

    return {
      source: DHAN_SCRIP_MASTER_SOURCE,
      sourceUrl: this.resolveSourceUrl(),
      latestCompletedRun: latest,
      runningRun: running,
      entryCount,
      activeCount,
      stale: this.isMasterStale(latest),
      staleAfterHours: INSTRUMENT_MASTER_STALE_HOURS,
    };
  }

  isMasterStale(
    latest:
      | {
          completedAt: Date | null;
        }
      | null
      | undefined,
  ) {
    if (!latest?.completedAt) {
      return true;
    }

    const ageMs = Date.now() - latest.completedAt.getTime();
    return ageMs > INSTRUMENT_MASTER_STALE_HOURS * 60 * 60 * 1000;
  }

  applyLifecycleRules(rows: DhanInstrumentMasterRow[]) {
    type EnrichedRow = DhanInstrumentMasterRow & {
      lifecycleStatus: InstrumentLifecycleStatus;
      supersededBySymbol: string | null;
      supersededBySecurityId: string | null;
    };

    const enriched: EnrichedRow[] = rows.map((row) => ({
      ...row,
      lifecycleStatus: InstrumentLifecycleStatus.ACTIVE,
      supersededBySymbol: null as string | null,
      supersededBySecurityId: null as string | null,
    }));

    let conflictCount = 0;

    const bySymbolExchange = groupBy(
      enriched,
      (row) => `${row.exchange}:${row.symbol}`,
    );

    for (const group of bySymbolExchange.values()) {
      if (group.length <= 1) {
        continue;
      }

      const tradable = group.filter(
        (row) => !row.buySellIndicator || row.buySellIndicator === 'A',
      );

      if (tradable.length > 1) {
        conflictCount += tradable.length;
        for (const row of tradable) {
          row.lifecycleStatus = InstrumentLifecycleStatus.INACTIVE;
        }
      }
    }

    const byIsin = groupBy(
      enriched.filter((row) => row.isin),
      (row) => `${row.exchange}:${row.isin as string}`,
    );

    for (const group of byIsin.values()) {
      if (group.length <= 1) {
        continue;
      }

      const sorted = [...group].sort((left, right) =>
        right.securityId.localeCompare(left.securityId, undefined, {
          numeric: true,
        }),
      );
      const current = sorted[0];

      for (const older of sorted.slice(1)) {
        older.lifecycleStatus = InstrumentLifecycleStatus.RENAMED;
        older.supersededBySymbol = current.symbol;
        older.supersededBySecurityId = current.securityId;
        conflictCount += 1;
      }
    }

    for (const row of enriched) {
      if (row.buySellIndicator && row.buySellIndicator !== 'A') {
        row.lifecycleStatus = InstrumentLifecycleStatus.DELISTED;
      }
    }

    return {
      rows: enriched,
      conflictCount,
    };
  }

  private async hasCompletedSyncWithHash(contentHash: string) {
    const existing = await this.prisma.instrumentMasterSyncRun.findFirst({
      where: {
        status: InstrumentMasterSyncStatus.COMPLETED,
        contentHash,
      },
      orderBy: { completedAt: 'desc' },
    });

    return Boolean(existing);
  }

  private async deactivateUnseenEntries(seenKeys: Set<string>, asOf: Date) {
    const existing = await this.prisma.instrumentMasterEntry.findMany({
      where: {
        lifecycleStatus: {
          in: [
            InstrumentLifecycleStatus.ACTIVE,
            InstrumentLifecycleStatus.RENAMED,
          ],
        },
      },
      select: {
        id: true,
        exchange: true,
        securityId: true,
      },
    });

    let deactivatedCount = 0;

    for (const entry of existing) {
      const key = masterKey(entry.exchange, entry.securityId);

      if (seenKeys.has(key)) {
        continue;
      }

      await this.prisma.instrumentMasterEntry.update({
        where: { id: entry.id },
        data: {
          lifecycleStatus: InstrumentLifecycleStatus.INACTIVE,
          lastSeenAt: asOf,
        },
      });

      deactivatedCount += 1;
    }

    return deactivatedCount;
  }

  private resolveSourceUrl() {
    return (
      this.configService.get<string>('DHAN_SCRIP_MASTER_URL')?.trim() ||
      DHAN_SCRIP_MASTER_DETAILED_URL
    );
  }

  private async fetchMasterCsv(sourceUrl: string) {
    let response: Response;

    try {
      response = await fetch(sourceUrl, {
        headers: { Accept: 'text/csv, text/plain, */*' },
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'network error';
      throw new ServiceUnavailableException(
        `Instrument master sync failed: unable to reach provider (${detail}).`,
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Instrument master sync failed with ${response.status}`,
      );
    }

    const text = await response.text();

    if (text.trim().length === 0) {
      throw new BadRequestException('Instrument master CSV was empty.');
    }

    return {
      text,
      fetchedAt: new Date(),
      metadata: {
        status: response.status,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
        contentLength: response.headers.get('content-length'),
        contentHash: hashInstrumentMasterContent(text),
      },
    };
  }
}

function masterKey(exchange: string, securityId: string) {
  return `${exchange}:${securityId}`;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}
