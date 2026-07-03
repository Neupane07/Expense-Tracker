import { Injectable } from '@nestjs/common';
import {
  PortfolioAssetClass,
  BrokerProvider,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildSourceMetadata,
  deriveReadinessStatus,
  mergeQualitySignals,
  type ReadinessCheckResult,
  type ReadinessReport,
} from '../common/data-quality';
import { BrokerCredentialsService } from '../broker/broker-credentials.service';
import { MarketDataQualityService } from '../market-data/market-data-quality.service';
import { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { CorporateActionSyncService } from '../market-data/corporate-action.service';
import { InstrumentsService } from '../market-data/instruments.service';
import { ResearchSnapshotService } from '../research/research-snapshot.service';

const BROKER_SYNC_STALE_HOURS = 24;
const RESEARCH_DISCLAIMER =
  'Readiness diagnostics only — does not run scans or place orders.';

export type ScannerReadinessInput = {
  symbols?: string[];
};

@Injectable()
export class ScannerReadinessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerCredentials: BrokerCredentialsService,
    private readonly marketQuality: MarketDataQualityService,
    private readonly instrumentVerification: InstrumentVerificationService,
    private readonly corporateActions: CorporateActionSyncService,
    private readonly instruments: InstrumentsService,
    private readonly researchSnapshots: ResearchSnapshotService,
  ) {}

  async getReadiness(
    userId: string,
    input: ScannerReadinessInput = {},
  ): Promise<ReadinessReport & { researchDisclaimer: string }> {
    const asOf = new Date();
    const checks: ReadinessCheckResult[] = [];
    const universe = await this.resolveUniverse(userId, input);
    const universeSource = input.symbols?.length ? 'symbols' : 'holdings';

    checks.push(await this.checkDhanConnection(userId));
    checks.push(await this.checkBrokerSync(userId, asOf));
    checks.push(await this.checkPortfolioContext(userId));

    const symbolChecks = await Promise.all(
      universe.map((symbol) => this.checkSymbol(userId, symbol, asOf)),
    );
    checks.push(...symbolChecks);

    if (universe.length === 0) {
      checks.push({
        id: 'universe',
        label: 'Scan universe',
        status: 'BLOCKED',
        warnings: [],
        blockers: ['SCAN_UNIVERSE_EMPTY'],
        details: { universeSource },
      });
    }

    const signals = mergeQualitySignals(
      ...checks.map((check) => ({
        warnings: check.warnings,
        blockers: check.blockers,
      })),
    );
    const status = deriveReadinessStatus({
      blockers: signals.blockers,
      warnings: signals.warnings,
      checks,
    });

    return {
      status,
      checks,
      universe,
      universeSource,
      ...buildSourceMetadata({
        source: 'scanner-readiness',
        asOf,
      }),
      ...signals,
      researchDisclaimer: RESEARCH_DISCLAIMER,
    };
  }

  private async checkDhanConnection(
    userId: string,
  ): Promise<ReadinessCheckResult> {
    const connection = await this.brokerCredentials.getDhanConnection(userId);
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (!connection.connected) {
      blockers.push('DHAN_NOT_CONNECTED');
    }

    if (!connection.hasApiKey || !connection.hasApiSecret) {
      blockers.push('DHAN_CREDENTIALS_INCOMPLETE');
    }

    if (!connection.hasAccessToken) {
      warnings.push('DHAN_ACCESS_TOKEN_MISSING');
    }

    return {
      id: 'dhan-connection',
      label: 'Dhan connection',
      status:
        blockers.length > 0
          ? 'BLOCKED'
          : warnings.length > 0
            ? 'DEGRADED'
            : 'READY',
      source: 'broker/dhan',
      asOf: connection.lastValidatedAt?.toISOString?.() ?? null,
      warnings,
      blockers,
      details: {
        connected: connection.connected,
        status: connection.status,
        hasApiKey: connection.hasApiKey,
        hasApiSecret: connection.hasApiSecret,
        hasAccessToken: connection.hasAccessToken,
      },
    };
  }

  private async checkBrokerSync(
    userId: string,
    asOf: Date,
  ): Promise<ReadinessCheckResult> {
    const connection = await this.prisma.brokerConnection.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: BrokerProvider.DHAN,
        },
      },
    });
    const latestHolding = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });
    const syncAt = connection?.lastSyncAt ?? latestHolding._max.asOf ?? null;
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (!syncAt) {
      blockers.push('BROKER_SYNC_MISSING');
      return {
        id: 'broker-sync',
        label: 'Broker sync',
        status: 'BLOCKED',
        source: 'broker/dhan',
        asOf: null,
        warnings,
        blockers,
        details: { syncAt: null },
      };
    }

    const ageHours = (asOf.getTime() - syncAt.getTime()) / (60 * 60 * 1000);

    if (ageHours > BROKER_SYNC_STALE_HOURS) {
      warnings.push('BROKER_SYNC_STALE');
    }

    return {
      id: 'broker-sync',
      label: 'Broker sync',
      status:
        blockers.length > 0
          ? 'BLOCKED'
          : warnings.length > 0
            ? 'DEGRADED'
            : 'READY',
      freshness: ageHours > BROKER_SYNC_STALE_HOURS ? 'STALE' : 'RECENT',
      source: 'broker/dhan',
      asOf: syncAt.toISOString(),
      warnings,
      blockers,
      details: { syncAt: syncAt.toISOString(), ageHours: round(ageHours, 2) },
    };
  }

  private async checkPortfolioContext(
    userId: string,
  ): Promise<ReadinessCheckResult> {
    const [holdingsCount, fund] = await Promise.all([
      this.countLatestHoldings(userId),
      this.prisma.brokerFundSnapshot.findFirst({
        where: { userId },
        orderBy: { asOf: 'desc' },
      }),
    ]);
    const warnings: string[] = [];
    const blockers: string[] = [];

    if (holdingsCount === 0) {
      warnings.push('NO_SYNCED_HOLDINGS');
    }

    if (!fund) {
      warnings.push('NO_CASH_SNAPSHOT');
    }

    return {
      id: 'portfolio-context',
      label: 'Portfolio context',
      status:
        blockers.length > 0
          ? 'BLOCKED'
          : warnings.length > 0
            ? 'DEGRADED'
            : 'READY',
      warnings,
      blockers,
      details: {
        holdingsCount,
        hasCashSnapshot: Boolean(fund),
      },
    };
  }

  private async checkSymbol(
    userId: string,
    symbol: string,
    asOf: Date,
  ): Promise<ReadinessCheckResult> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const warnings: string[] = [];
    const blockers: string[] = [];
    const details: Record<string, unknown> = { symbol: normalizedSymbol };

    const resolution = await this.instruments.resolveMapping(
      userId,
      normalizedSymbol,
    );
    const mapping =
      this.instrumentVerification.evaluateFromResolution(resolution);
    warnings.push(...mapping.warnings);
    blockers.push(...mapping.blockers);
    details.mapping = mapping;

    if (mapping.blockers.length > 0 || !resolution.securityId) {
      return {
        id: `symbol:${normalizedSymbol}`,
        label: normalizedSymbol,
        status: 'BLOCKED',
        mappingStatus: mapping.mappingStatus,
        warnings: [...new Set(warnings)],
        blockers: [...new Set(blockers)],
        details,
      };
    }

    const instrument = await this.prisma.instrument.findFirst({
      where: {
        symbol: resolution.symbol,
        exchange: resolution.exchange,
      },
    });

    if (!instrument) {
      const orphanedEvents =
        await this.corporateActions.countBlockingOrphanedEvents(
          resolution.symbol,
          resolution.exchange,
        );
      if (orphanedEvents > 0) {
        blockers.push('CORPORATE_ACTION_PENDING_INVALIDATION');
        warnings.push('CORPORATE_ACTION_PENDING_INVALIDATION');
      }
      blockers.push('INSTRUMENT_MAPPING_MISSING');
      return {
        id: `symbol:${normalizedSymbol}`,
        label: normalizedSymbol,
        status: 'BLOCKED',
        mappingStatus: mapping.mappingStatus,
        warnings: [...new Set(warnings)],
        blockers: [...new Set(blockers)],
        details,
      };
    }

    const instrumentId = instrument.id;

    const price = await this.prisma.priceSnapshot.findFirst({
      where: { instrumentId },
      orderBy: { timestamp: 'desc' },
    });
    const priceQuality = this.marketQuality.priceQuality(
      price?.timestamp ?? null,
      asOf,
    );
    details.price = {
      source: price?.source ?? null,
      asOf: price?.timestamp?.toISOString() ?? null,
      freshness: priceQuality.dataQuality.freshness,
    };
    warnings.push(...priceQuality.warnings);
    if (priceQuality.dataQuality.freshness === 'MISSING') {
      blockers.push('PRICE_MISSING');
    }
    if (priceQuality.dataQuality.freshness === 'STALE') {
      blockers.push('PRICE_STALE');
    }

    const candles = await this.prisma.dailyCandle.findMany({
      where: { instrumentId },
      select: {
        isAdjusted: true,
        date: true,
        source: true,
        dataQuality: true,
      },
      orderBy: { date: 'desc' },
      take: 250,
    });
    const candleWarnings = this.marketQuality.candleWarnings(candles.length);
    warnings.push(...candleWarnings);
    if (candles.length === 0) {
      blockers.push('CANDLES_MISSING');
    }

    const corporateAction = await this.corporateActions.evaluateForInstrument(
      {
        id: instrument.id,
        symbol: instrument.symbol,
        exchange: instrument.exchange,
      },
      candles,
      asOf,
    );
    warnings.push(...corporateAction.warnings);
    blockers.push(...corporateAction.blockers);
    details.corporateAction = corporateAction;

    const indicators = await this.prisma.technicalIndicatorSnapshot.findFirst({
      where: { instrumentId },
      orderBy: { asOfDate: 'desc' },
    });
    details.indicators = {
      source: indicators?.source ?? null,
      asOf: indicators?.asOfDate?.toISOString() ?? null,
      present: Boolean(indicators),
    };
    if (!indicators) {
      warnings.push('INDICATORS_MISSING');
    }
    if (corporateAction.blocksHistoricalAnalysis) {
      blockers.push('HISTORICAL_ANALYSIS_BLOCKED_UNVERIFIED_ADJUSTMENT');
    }

    const research = await this.researchSnapshots.getScannerResearchStatus(
      userId,
      normalizedSymbol,
    );
    details.research = research;
    warnings.push(...research.researchWarnings);
    if (research.researchFreshness === 'missing') {
      warnings.push('RESEARCH_EVIDENCE_MISSING');
    }
    if (research.researchFreshness === 'stale') {
      warnings.push('STALE_RESEARCH_EVIDENCE');
    }

    const status =
      blockers.length > 0
        ? 'BLOCKED'
        : warnings.length > 0
          ? 'DEGRADED'
          : 'READY';

    return {
      id: `symbol:${normalizedSymbol}`,
      label: normalizedSymbol,
      status,
      mappingStatus: mapping.mappingStatus,
      freshness: priceQuality.dataQuality.freshness,
      source: price?.source ?? instrument.source,
      asOf:
        price?.timestamp?.toISOString() ??
        instrument.lastVerifiedAt?.toISOString() ??
        null,
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      details,
    };
  }

  private async resolveUniverse(userId: string, input: ScannerReadinessInput) {
    if (input.symbols?.length) {
      return [
        ...new Set(
          input.symbols
            .map((symbol) => symbol.trim().toUpperCase())
            .filter(Boolean),
        ),
      ];
    }

    const latest = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return [];
    }

    const holdings = await this.prisma.brokerHoldingSnapshot.findMany({
      where: {
        userId,
        asOf: latest._max.asOf,
        assetClass: {
          in: [PortfolioAssetClass.STOCK, PortfolioAssetClass.ETF],
        },
      },
      select: { tradingSymbol: true },
    });

    return [
      ...new Set(
        holdings.map((holding) => holding.tradingSymbol.trim().toUpperCase()),
      ),
    ];
  }

  private async countLatestHoldings(userId: string) {
    const latest = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return 0;
    }

    return this.prisma.brokerHoldingSnapshot.count({
      where: { userId, asOf: latest._max.asOf },
    });
  }
}

function round(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
