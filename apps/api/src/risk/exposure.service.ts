import { Injectable } from '@nestjs/common';
import { PortfolioAssetClass } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActiveTradeService,
  type ActiveTradeReconciliation,
  type ReconciledActiveTrade,
} from './active-trade.service';

type DecimalLike = {
  toNumber(): number;
};

export type HoldingExposure = {
  symbol: string;
  name: string;
  assetClass: string;
  marketValue: number;
  quantity: number;
  sector: string | null;
  theme: string | null;
  weightPct: number;
};

export type PortfolioRiskSnapshot = {
  totalPortfolioValue: number;
  cash: number;
  activeSwingCapital: number;
  activeSwingTradeCount: number;
  maxLossIfActiveStopLossesHit: number;
  activeTrades: ReconciledActiveTrade[];
  activeTradeReconciliation: Pick<
    ActiveTradeReconciliation,
    'confirmedCount' | 'inferredBrokerPositions' | 'unmatchedJournalEntries'
  >;
  topHoldingsConcentration: HoldingExposure[];
  assetAllocation: {
    stock: number;
    etf: number;
    mutualFund: number;
    cash: number;
  };
  sectorExposure: Array<{ sector: string; value: number; weightPct: number }>;
  themeExposure: Array<{ theme: string; value: number; weightPct: number }>;
  warnings: string[];
};

export type TradeExposure = {
  symbol: string;
  alreadyHeld: boolean;
  existingMarketValue: number;
  totalPortfolioValue: number;
  beforeAmount: number;
  beforePct: number;
  afterAmount: number;
  afterPct: number;
  concentrationIncreasePct: number;
};

@Injectable()
export class ExposureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activeTrades: ActiveTradeService,
  ) {}

  async getPortfolioRisk(userId: string): Promise<PortfolioRiskSnapshot> {
    const [holdings, fund, latestSnapshot, reconciliation] = await Promise.all([
      this.findLatestHoldings(userId),
      this.findLatestFund(userId),
      this.findLatestPortfolioSnapshot(userId),
      this.activeTrades.reconcile(userId),
    ]);
    const instruments = await this.findInstrumentsForHoldings(holdings);
    const cash = roundMoney(this.decimalToNumber(fund?.availableBalance));
    const stockValue = this.sumAssetClass(holdings, PortfolioAssetClass.STOCK);
    const etfValue = this.sumAssetClass(holdings, PortfolioAssetClass.ETF);
    const mutualFundValue = this.decimalToNumber(latestSnapshot?.totalMfValue);
    const totalPortfolioValue = roundMoney(
      stockValue + etfValue + mutualFundValue + cash,
    );
    const enrichedHoldings = holdings.map((holding) => {
      const instrument = instruments.get(holding.tradingSymbol.toUpperCase());
      const marketValue = this.decimalToNumber(holding.marketValue);

      return {
        symbol: holding.tradingSymbol,
        name: instrument?.name ?? holding.tradingSymbol,
        assetClass: holding.assetClass,
        marketValue,
        quantity: this.decimalToNumber(holding.totalQty),
        sector: instrument?.sector ?? null,
        theme: instrument?.industry ?? null,
        weightPct: percent(marketValue, totalPortfolioValue),
      };
    });
    const warnings = this.buildPortfolioWarnings({
      holdingsCount: holdings.length,
      hasFund: Boolean(fund),
      hasMutualFundSnapshot: Boolean(latestSnapshot),
      enrichedHoldings,
      reconciliation,
    });

    return {
      totalPortfolioValue,
      cash,
      activeSwingCapital: reconciliation.activeSwingCapital,
      activeSwingTradeCount: reconciliation.activeSwingTradeCount,
      maxLossIfActiveStopLossesHit: reconciliation.maxLossIfActiveStopLossesHit,
      activeTrades: reconciliation.trades,
      activeTradeReconciliation: {
        confirmedCount: reconciliation.confirmedCount,
        inferredBrokerPositions: reconciliation.inferredBrokerPositions,
        unmatchedJournalEntries: reconciliation.unmatchedJournalEntries,
      },
      topHoldingsConcentration: enrichedHoldings
        .sort((a, b) => b.marketValue - a.marketValue)
        .slice(0, 5),
      assetAllocation: {
        stock: roundMoney(stockValue),
        etf: roundMoney(etfValue),
        mutualFund: roundMoney(mutualFundValue),
        cash,
      },
      sectorExposure: aggregateExposure(
        enrichedHoldings.map((holding) => ({
          label: holding.sector,
          value: holding.marketValue,
        })),
        totalPortfolioValue,
        'UNMAPPED',
      ).map(({ label, ...rest }) => ({ sector: label, ...rest })),
      themeExposure: aggregateExposure(
        enrichedHoldings.map((holding) => ({
          label: holding.theme,
          value: holding.marketValue,
        })),
        totalPortfolioValue,
        'UNMAPPED',
      ).map(({ label, ...rest }) => ({ theme: label, ...rest })),
      warnings,
    };
  }

  async getTradeExposure(
    userId: string,
    symbol: string,
    capitalRequired: number,
  ): Promise<TradeExposure> {
    const [portfolio, holdings] = await Promise.all([
      this.getPortfolioRisk(userId),
      this.findLatestHoldings(userId),
    ]);
    const normalizedSymbol = symbol.trim().toUpperCase();
    const existing = holdings.find(
      (holding) => holding.tradingSymbol.toUpperCase() === normalizedSymbol,
    );
    const existingMarketValue = this.decimalToNumber(existing?.marketValue);
    const denominator = Math.max(
      portfolio.totalPortfolioValue,
      capitalRequired,
    );
    const afterAmount = existingMarketValue + Math.max(capitalRequired, 0);

    return {
      symbol: normalizedSymbol,
      alreadyHeld: existingMarketValue > 0,
      existingMarketValue: roundMoney(existingMarketValue),
      totalPortfolioValue: roundMoney(portfolio.totalPortfolioValue),
      beforeAmount: roundMoney(existingMarketValue),
      beforePct: percent(existingMarketValue, denominator),
      afterAmount: roundMoney(afterAmount),
      afterPct: percent(afterAmount, denominator),
      concentrationIncreasePct: percent(capitalRequired, denominator),
    };
  }

  private async findLatestHoldings(userId: string) {
    const latest = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return [];
    }

    return this.prisma.brokerHoldingSnapshot.findMany({
      where: { userId, asOf: latest._max.asOf },
      orderBy: { tradingSymbol: 'asc' },
    });
  }

  private findLatestFund(userId: string) {
    return this.prisma.brokerFundSnapshot.findFirst({
      where: { userId },
      orderBy: { asOf: 'desc' },
    });
  }

  private findLatestPortfolioSnapshot(userId: string) {
    return this.prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotTime: 'desc' },
    });
  }

  private async findInstrumentsForHoldings(
    holdings: Array<{ tradingSymbol: string }>,
  ) {
    const symbols = [
      ...new Set(
        holdings.map((holding) => holding.tradingSymbol.toUpperCase()),
      ),
    ];
    const instruments =
      symbols.length > 0
        ? await this.prisma.instrument.findMany({
            where: { symbol: { in: symbols } },
          })
        : [];

    return new Map(
      instruments.map((instrument) => [
        instrument.symbol.toUpperCase(),
        instrument,
      ]),
    );
  }

  private sumAssetClass(
    holdings: Array<{
      assetClass: PortfolioAssetClass;
      marketValue: DecimalLike;
    }>,
    assetClass: PortfolioAssetClass,
  ) {
    return holdings
      .filter((holding) => holding.assetClass === assetClass)
      .reduce(
        (total, holding) => total + this.decimalToNumber(holding.marketValue),
        0,
      );
  }

  private buildPortfolioWarnings(input: {
    holdingsCount: number;
    hasFund: boolean;
    hasMutualFundSnapshot: boolean;
    enrichedHoldings: HoldingExposure[];
    reconciliation: ActiveTradeReconciliation;
  }) {
    const warnings: string[] = [...input.reconciliation.warnings];

    if (input.holdingsCount === 0) {
      warnings.push('NO_SYNCED_HOLDINGS');
    }

    if (!input.hasFund) {
      warnings.push('NO_CASH_SNAPSHOT');
    }

    if (!input.hasMutualFundSnapshot) {
      warnings.push('NO_MUTUAL_FUND_SNAPSHOT');
    }

    if (input.enrichedHoldings.some((holding) => !holding.sector)) {
      warnings.push('SECTOR_EXPOSURE_PARTIALLY_UNMAPPED');
    }

    if (input.reconciliation.activeSwingTradeCount === 0) {
      warnings.push('NO_ACTIVE_JOURNAL_SWING_TRADES');
    }

    return [...new Set(warnings)];
  }

  private decimalToNumber(value: DecimalLike | number | null | undefined) {
    if (typeof value === 'number') {
      return value;
    }

    return value?.toNumber() ?? 0;
  }
}

function aggregateExposure(
  rows: Array<{ label: string | null; value: number }>,
  total: number,
  fallbackLabel: string,
) {
  const exposure = new Map<string, number>();

  for (const row of rows) {
    const label = row.label ?? fallbackLabel;
    exposure.set(label, (exposure.get(label) ?? 0) + row.value);
  }

  return Array.from(exposure.entries())
    .map(([label, value]) => ({
      label,
      value: roundMoney(value),
      weightPct: percent(value, total),
    }))
    .sort((a, b) => b.value - a.value);
}

function percent(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 10000) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
