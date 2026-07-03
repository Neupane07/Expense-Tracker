import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CorporateActionEventType,
  CorporateActionSyncStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MANUAL_CORPORATE_ACTION_IMPORT_SOURCE,
  NSE_CORPORATE_ACTION_EVENT_SOURCE,
  PRICE_AFFECTING_EVENT_TYPES,
} from './corporate-action.constants';
import type { CorporateActionImportEvent } from './corporate-action.dto';
import { CorporateActionPolicyService } from './corporate-action-policy.service';

export type CorporateActionInstrumentRef = {
  id: string;
  symbol: string;
  exchange: string;
  securityId?: string | null;
};

@Injectable()
export class CorporateActionInvalidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CorporateActionPolicyService,
  ) {}

  async invalidateForEvent(eventId: string) {
    const event = await this.prisma.corporateActionEvent.findUnique({
      where: { id: eventId },
    });

    if (!event || event.supersededAt) {
      return { invalidatedCandleCount: 0, invalidatedIndicatorCount: 0 };
    }

    const invalidationFromDate = this.policy.resolveInvalidationFromDate({
      eventType: event.eventType,
      exDate: event.exDate,
      effectiveDate: event.effectiveDate,
    });

    if (!invalidationFromDate || !event.instrumentId) {
      await this.prisma.corporateActionEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });

      return { invalidatedCandleCount: 0, invalidatedIndicatorCount: 0 };
    }

    const candleDelete = await this.prisma.dailyCandle.deleteMany({
      where: {
        instrumentId: event.instrumentId,
        date: { lt: invalidationFromDate },
      },
    });

    const indicatorDelete =
      await this.prisma.technicalIndicatorSnapshot.deleteMany({
        where: { instrumentId: event.instrumentId },
      });

    await this.prisma.corporateActionEvent.update({
      where: { id: event.id },
      data: {
        invalidationFromDate,
      },
    });

    return {
      invalidatedCandleCount: candleDelete.count,
      invalidatedIndicatorCount: indicatorDelete.count,
    };
  }

  async completeRehydrationIfReady(instrumentId: string) {
    const pending = await this.prisma.corporateActionEvent.findMany({
      where: {
        instrumentId,
        supersededAt: null,
        processedAt: null,
        invalidationFromDate: { not: null },
        eventType: {
          in: Array.from(
            PRICE_AFFECTING_EVENT_TYPES,
          ) as CorporateActionEventType[],
        },
      },
    });

    let completedCount = 0;

    for (const event of pending) {
      if (!event.invalidationFromDate) {
        continue;
      }

      const rehydratedCount = await this.prisma.dailyCandle.count({
        where: {
          instrumentId,
          date: { lt: event.invalidationFromDate },
        },
      });

      if (rehydratedCount === 0) {
        continue;
      }

      await this.prisma.corporateActionEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
      completedCount += 1;
    }

    return { completedCount };
  }

  async needsProviderRehydration(
    instrument: CorporateActionInstrumentRef,
    fromDate: Date,
    candles: Array<{ date: Date }>,
  ) {
    const pendingRehydration = await this.prisma.corporateActionEvent.count({
      where: this.pendingRehydrationWhere(instrument),
    });

    if (pendingRehydration > 0) {
      return true;
    }

    if (candles.length === 0) {
      return true;
    }

    return candles[0].date.getTime() > fromDate.getTime();
  }

  async linkOrphanedEventsForInstrument(
    instrument: CorporateActionInstrumentRef,
  ) {
    await this.prisma.corporateActionEvent.updateMany({
      where: {
        symbol: instrument.symbol,
        exchange: instrument.exchange,
        instrumentId: null,
      },
      data: {
        instrumentId: instrument.id,
        securityId: instrument.securityId ?? undefined,
      },
    });

    return this.processPendingForInstrument(instrument.id);
  }

  async countBlockingOrphanedEvents(symbol: string, exchange: string) {
    return this.prisma.corporateActionEvent.count({
      where: {
        symbol,
        exchange,
        instrumentId: null,
        supersededAt: null,
        processedAt: null,
        eventType: {
          in: Array.from(
            PRICE_AFFECTING_EVENT_TYPES,
          ) as CorporateActionEventType[],
        },
      },
    });
  }

  private pendingRehydrationWhere(instrument: CorporateActionInstrumentRef) {
    return {
      supersededAt: null,
      processedAt: null,
      invalidationFromDate: { not: null },
      eventType: {
        in: Array.from(
          PRICE_AFFECTING_EVENT_TYPES,
        ) as CorporateActionEventType[],
      },
      OR: [
        { instrumentId: instrument.id },
        {
          instrumentId: null,
          symbol: instrument.symbol,
          exchange: instrument.exchange,
        },
      ],
    };
  }

  async processPendingForInstrument(instrumentId: string) {
    const pending = await this.prisma.corporateActionEvent.findMany({
      where: {
        instrumentId,
        supersededAt: null,
        processedAt: null,
        eventType: {
          in: Array.from(
            PRICE_AFFECTING_EVENT_TYPES,
          ) as CorporateActionEventType[],
        },
      },
      orderBy: [{ effectiveDate: 'asc' }, { createdAt: 'asc' }],
    });

    let invalidatedCandleCount = 0;
    let invalidatedIndicatorCount = 0;

    for (const event of pending) {
      const result = await this.invalidateForEvent(event.id);
      invalidatedCandleCount += result.invalidatedCandleCount;
      invalidatedIndicatorCount += result.invalidatedIndicatorCount;
    }

    return { invalidatedCandleCount, invalidatedIndicatorCount };
  }
}

@Injectable()
export class CorporateActionImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CorporateActionPolicyService,
    private readonly invalidation: CorporateActionInvalidationService,
  ) {}

  async importEvents(events: CorporateActionImportEvent[]) {
    const run = await this.prisma.corporateActionSyncRun.create({
      data: {
        status: CorporateActionSyncStatus.RUNNING,
        source: events[0]?.source ?? MANUAL_CORPORATE_ACTION_IMPORT_SOURCE,
      },
    });

    let importedCount = 0;
    let skippedCount = 0;
    let correctedCount = 0;
    const errors: string[] = [];

    try {
      for (const input of events) {
        try {
          const result = await this.importSingleEvent(input, run.id);
          if (result.action === 'imported') {
            importedCount += 1;
          } else if (result.action === 'corrected') {
            correctedCount += 1;
            importedCount += 1;
          } else {
            skippedCount += 1;
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          errors.push(`${input.sourceEventId}: ${message}`);
        }
      }

      const completedAt = new Date();
      const status =
        errors.length > 0 && importedCount === 0
          ? CorporateActionSyncStatus.FAILED
          : CorporateActionSyncStatus.COMPLETED;

      const updatedRun = await this.prisma.corporateActionSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          completedAt,
          eventCount: events.length,
          importedCount,
          skippedCount,
          correctedCount,
          errorMessage: errors.length > 0 ? errors.join(' | ') : null,
          rawMetadata: {
            importType: 'structured_json',
          },
        },
      });

      return {
        run: updatedRun,
        importedCount,
        skippedCount,
        correctedCount,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.corporateActionSyncRun.update({
        where: { id: run.id },
        data: {
          status: CorporateActionSyncStatus.FAILED,
          completedAt: new Date(),
          errorMessage: message,
        },
      });
      throw error;
    }
  }

  private async importSingleEvent(
    input: CorporateActionImportEvent,
    syncRunId: string,
  ) {
    const symbol = input.symbol.trim().toUpperCase();
    const exchange = input.exchange.trim().toUpperCase();
    const existing = await this.prisma.corporateActionEvent.findUnique({
      where: {
        source_sourceEventId: {
          source: input.source,
          sourceEventId: input.sourceEventId,
        },
      },
    });

    if (existing && !input.supersedesSourceEventId) {
      return { action: 'skipped' as const, eventId: existing.id };
    }

    const instrument = await this.prisma.instrument.findUnique({
      where: { symbol_exchange: { symbol, exchange } },
    });

    const effectiveDate = parseEventDate(input.effectiveDate, 'effectiveDate');
    const exDate = input.exDate ? parseEventDate(input.exDate, 'exDate') : null;
    const recordDate = input.recordDate
      ? parseEventDate(input.recordDate, 'recordDate')
      : null;

    let supersededEventId: string | null = null;

    if (input.supersedesSourceEventId) {
      const superseded = await this.prisma.corporateActionEvent.findUnique({
        where: {
          source_sourceEventId: {
            source: input.source,
            sourceEventId: input.supersedesSourceEventId,
          },
        },
      });

      if (!superseded) {
        throw new BadRequestException(
          `Superseded event ${input.supersedesSourceEventId} was not found.`,
        );
      }

      supersededEventId = superseded.id;
    }

    const invalidationFromDate = this.policy.resolveInvalidationFromDate({
      eventType: input.eventType,
      exDate,
      effectiveDate,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      if (supersededEventId) {
        await tx.corporateActionEvent.update({
          where: { id: supersededEventId },
          data: { supersededAt: new Date() },
        });
      }

      return tx.corporateActionEvent.create({
        data: {
          instrumentId: instrument?.id ?? null,
          symbol,
          exchange,
          securityId: input.securityId ?? instrument?.securityId ?? null,
          eventType: input.eventType,
          effectiveDate,
          exDate,
          recordDate,
          ratioNumerator: input.ratioNumerator ?? null,
          ratioDenominator: input.ratioDenominator ?? null,
          cashAmount: input.cashAmount ?? null,
          source: input.source,
          sourceEventId: input.sourceEventId,
          rawEvidence: input.rawEvidence as Prisma.InputJsonValue,
          invalidationFromDate,
          syncRunId,
        },
      });
    });

    if (instrument?.id && invalidationFromDate) {
      await this.invalidation.invalidateForEvent(created.id);
    } else if (!PRICE_AFFECTING_EVENT_TYPES.has(input.eventType)) {
      await this.prisma.corporateActionEvent.update({
        where: { id: created.id },
        data: { processedAt: new Date() },
      });
    }

    return {
      action: supersededEventId
        ? ('corrected' as const)
        : ('imported' as const),
      eventId: created.id,
    };
  }
}

@Injectable()
export class CorporateActionSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: CorporateActionPolicyService,
    private readonly importService: CorporateActionImportService,
    private readonly invalidation: CorporateActionInvalidationService,
  ) {}

  async syncFromProvider() {
    const run = await this.prisma.corporateActionSyncRun.create({
      data: {
        status: CorporateActionSyncStatus.UNAVAILABLE,
        source: NSE_CORPORATE_ACTION_EVENT_SOURCE,
        completedAt: new Date(),
        errorMessage:
          'Automated corporate-action event sync is unavailable. NSE EOD Corporate Announcement requires a paid SFTP subscription; Dhan provides provider-adjusted daily candles only (no event feed). Use POST /market-data/sync/corporate-actions/import for structured official exports.',
        rawMetadata: {
          blocker: 'NSE_EOD_CA_SUBSCRIPTION_REQUIRED',
          candleAdjustmentSource: 'DHAN_PROVIDER_DAILY_ADJUSTED',
          documentation:
            'https://www.nseindia.com/static/market-data/corporate-data-subscription',
        },
      },
    });

    return {
      run,
      available: false,
      reason: 'NSE_EOD_CA_SUBSCRIPTION_REQUIRED',
    };
  }

  async getStatusSummary() {
    const latestRun = await this.prisma.corporateActionSyncRun.findFirst({
      orderBy: { startedAt: 'desc' },
    });
    const latestSuccessful = await this.prisma.corporateActionSyncRun.findFirst(
      {
        where: { status: CorporateActionSyncStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      },
    );
    const eventCount = await this.prisma.corporateActionEvent.count({
      where: { supersededAt: null },
    });
    const pendingCount = await this.prisma.corporateActionEvent.count({
      where: {
        supersededAt: null,
        processedAt: null,
        eventType: {
          in: Array.from(
            PRICE_AFFECTING_EVENT_TYPES,
          ) as CorporateActionEventType[],
        },
      },
    });

    return {
      candleAdjustmentProvider: {
        source: 'DHAN',
        policy: 'DHAN_PROVIDER_DAILY_ADJUSTED',
        available: true,
        documentationUrl:
          'https://dhan.co/support/platforms/dhanhq-api/is-the-historical-data-from-dhan-s-data-api-adjusted-for-corporate-actions-like-bonuses-and-splits/',
      },
      eventCatalogProvider: {
        source: NSE_CORPORATE_ACTION_EVENT_SOURCE,
        available: false,
        blocker: 'NSE_EOD_CA_SUBSCRIPTION_REQUIRED',
        importSupported: true,
      },
      latestRun: latestRun
        ? {
            id: latestRun.id,
            status: latestRun.status,
            source: latestRun.source,
            startedAt: latestRun.startedAt,
            completedAt: latestRun.completedAt,
            eventCount: latestRun.eventCount,
            importedCount: latestRun.importedCount,
            errorMessage: latestRun.errorMessage,
          }
        : null,
      lastSuccessfulEventSyncAt:
        latestSuccessful?.completedAt?.toISOString() ?? null,
      activeEventCount: eventCount,
      pendingInvalidationCount: pendingCount,
    };
  }

  importEvents(events: CorporateActionImportEvent[]) {
    return this.importService.importEvents(events);
  }

  async evaluateForInstrument(
    instrument: CorporateActionInstrumentRef,
    candles: Array<{
      source: string;
      isAdjusted: boolean;
      dataQuality?: unknown;
    }>,
    asOf = new Date(),
  ) {
    const events = await this.prisma.corporateActionEvent.findMany({
      where: {
        supersededAt: null,
        OR: [
          { instrumentId: instrument.id },
          {
            instrumentId: null,
            symbol: instrument.symbol,
            exchange: instrument.exchange,
          },
        ],
      },
      select: {
        eventType: true,
        exDate: true,
        effectiveDate: true,
        processedAt: true,
        supersededAt: true,
        invalidationFromDate: true,
      },
    });
    const latestSuccessful = await this.prisma.corporateActionSyncRun.findFirst(
      {
        where: { status: CorporateActionSyncStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      },
    );

    return this.policy.evaluatePolicy({
      candles: candles.map((candle) => ({
        source: candle.source,
        isAdjusted: candle.isAdjusted,
        dataQuality:
          candle.dataQuality && typeof candle.dataQuality === 'object'
            ? (candle.dataQuality as Record<string, unknown>)
            : null,
      })),
      events,
      lastSuccessfulEventSyncAt: latestSuccessful?.completedAt ?? null,
      asOf,
    });
  }

  async evaluateOrphanedEventsForSymbol(symbol: string, exchange: string) {
    const events = await this.prisma.corporateActionEvent.findMany({
      where: {
        symbol,
        exchange,
        instrumentId: null,
        supersededAt: null,
      },
      select: {
        eventType: true,
        exDate: true,
        effectiveDate: true,
        processedAt: true,
        supersededAt: true,
        invalidationFromDate: true,
      },
    });
    const latestSuccessful = await this.prisma.corporateActionSyncRun.findFirst(
      {
        where: { status: CorporateActionSyncStatus.COMPLETED },
        orderBy: { completedAt: 'desc' },
      },
    );

    return this.policy.evaluatePolicy({
      candles: [],
      events,
      lastSuccessfulEventSyncAt: latestSuccessful?.completedAt ?? null,
    });
  }

  linkOrphanedEventsAndProcess(instrument: CorporateActionInstrumentRef) {
    return this.invalidation.linkOrphanedEventsForInstrument(instrument);
  }

  needsProviderRehydration(
    instrument: CorporateActionInstrumentRef,
    fromDate: Date,
    candles: Array<{ date: Date }>,
  ) {
    return this.invalidation.needsProviderRehydration(
      instrument,
      fromDate,
      candles,
    );
  }

  completeRehydrationIfReady(instrumentId: string) {
    return this.invalidation.completeRehydrationIfReady(instrumentId);
  }

  countBlockingOrphanedEvents(symbol: string, exchange: string) {
    return this.invalidation.countBlockingOrphanedEvents(symbol, exchange);
  }
}

function parseEventDate(value: string, field: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${field}: ${value}`);
  }

  return parsed;
}
