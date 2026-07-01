import { Injectable } from '@nestjs/common';
import { BrokerHoldingsQueryService } from '../broker/broker-holdings-query.service';
import { BrokerProvider, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from './allocation.service';
import { HoldingsValuationService } from './holdings-valuation.service';
import { MutualFundsService } from './mutual-funds/mutual-funds.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class PortfolioSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
    private readonly mutualFundsService: MutualFundsService,
    private readonly brokerHoldingsQuery: BrokerHoldingsQueryService,
    private readonly holdingsValuation: HoldingsValuationService,
  ) {}

  async createSnapshotFromLatest(userId: string, syncRunId?: string) {
    const built = await this.buildSnapshot(userId, syncRunId);
    const snapshot = await this.prisma.portfolioSnapshot.create({
      data: {
        userId,
        brokerAccountId: built.brokerAccountId,
        snapshotTime: built.snapshotTime,
        totalStockValue: built.allocation.stockValue,
        totalEtfValue: built.allocation.etfValue,
        totalMfValue: built.allocation.mutualFundValue,
        totalCashValue: built.allocation.cashValue,
        totalValue: built.allocation.totalValue,
        allocation: this.toJson(built.allocation),
        source: this.toJson(built.source),
        warnings: built.warnings,
      },
    });

    return {
      id: snapshot.id,
      ...built,
    };
  }

  async getLatestSnapshot(userId: string) {
    const snapshot = await this.prisma.portfolioSnapshot.findFirst({
      where: { userId },
      orderBy: { snapshotTime: 'desc' },
    });

    if (!snapshot) {
      return this.createSnapshotFromLatest(userId);
    }

    const source = this.readSnapshotSource(snapshot.source);
    const allocation = this.readAllocation(snapshot.allocation);
    const mutualFunds = await this.mutualFundsService.getValuations(userId);
    const listedSummary = await this.resolveListedSummary(
      userId,
      source,
      allocation.cashValue,
      mutualFunds,
    );
    const summary =
      source.summary ??
      this.buildSummary({
        listed: listedSummary,
        mutualFunds,
        cashValue: allocation.cashValue,
      });

    return {
      id: snapshot.id,
      snapshotTime: snapshot.snapshotTime,
      brokerAccountId: snapshot.brokerAccountId,
      allocation,
      summary,
      listedSummary,
      priceAsOf: source.priceAsOf ? new Date(source.priceAsOf) : null,
      mutualFunds,
      warnings: [...snapshot.warnings, ...mutualFunds.warnings],
      source: {
        brokerProvider: source.brokerProvider ?? BrokerProvider.DHAN,
        syncRunId: source.syncRunId ?? null,
        holdingCount: source.holdingCount ?? listedSummary.holdingCount,
        fundSnapshotId: source.fundSnapshotId ?? null,
        mutualFundHoldingCount: mutualFunds.holdings.length,
      },
    };
  }

  private async resolveListedSummary(
    userId: string,
    source: {
      holdingCount: number;
      listedSummary?:
        | import('./holdings-valuation.service').HoldingsValuationSummary
        | undefined;
    },
    _cashValue: number,
    _mutualFunds: Awaited<ReturnType<MutualFundsService['getValuations']>>,
  ) {
    if (source.listedSummary && source.listedSummary.holdingCount > 0) {
      return source.listedSummary;
    }

    if ((source.holdingCount ?? 0) === 0) {
      return emptyListedSummary();
    }

    const { holdings } =
      await this.brokerHoldingsQuery.findReconciledHoldings(userId);
    if (holdings.length === 0) {
      return emptyListedSummary();
    }

    const valuation = await this.holdingsValuation.value(
      userId,
      holdings.map((holding) => ({
        tradingSymbol: holding.tradingSymbol,
        securityId: holding.securityId,
        exchange: holding.exchange,
        isin: holding.isin,
        assetClass: holding.assetClass,
        totalQty: this.decimalToNumber(holding.totalQty),
        costValue: this.decimalToNumber(holding.costValue),
      })),
      new Date(),
      { preferCachedPrices: true },
    );

    void _cashValue;
    void _mutualFunds;

    return valuation.summary;
  }

  private async buildSnapshot(userId: string, syncRunId?: string) {
    const { holdings, excludedCount } =
      await this.brokerHoldingsQuery.findReconciledHoldings(userId, syncRunId);
    const fund = await this.findFund(userId, syncRunId);
    const mutualFunds = await this.mutualFundsService.getValuations(userId);
    const cashValue = this.decimalToNumber(fund?.availableBalance);
    const valuation = await this.holdingsValuation.value(
      userId,
      holdings.map((holding) => ({
        tradingSymbol: holding.tradingSymbol,
        securityId: holding.securityId,
        exchange: holding.exchange,
        isin: holding.isin,
        assetClass: holding.assetClass,
        totalQty: this.decimalToNumber(holding.totalQty),
        costValue: this.decimalToNumber(holding.costValue),
      })),
    );
    const allocation = this.allocationService.calculateStockEtfCashAllocation(
      valuation.holdings.map((holding) => ({
        assetClass: holding.assetClass as never,
        marketValue: holding.currentValue,
      })),
      cashValue,
      mutualFunds.totalValue,
    );
    const summary = this.buildSummary({
      listed: valuation.summary,
      mutualFunds,
      cashValue,
    });
    const brokerAccountIds = new Set(
      [
        ...holdings.map((holding) => holding.brokerAccountId),
        fund?.brokerAccountId,
      ].filter(Boolean),
    );
    const brokerAccountId =
      brokerAccountIds.size === 1
        ? (Array.from(brokerAccountIds)[0] as string)
        : null;
    const snapshotTime = new Date();
    const warnings = [
      ...this.buildWarnings(holdings.length, fund !== null, excludedCount),
      ...valuation.warnings,
      ...mutualFunds.warnings,
    ];
    const source = {
      brokerProvider: BrokerProvider.DHAN,
      syncRunId: syncRunId ?? null,
      holdingCount: holdings.length,
      fundSnapshotId: fund?.id ?? null,
      mutualFundHoldingCount: mutualFunds.holdings.length,
      mutualFundNavDates: mutualFunds.holdings
        .map((holding) => holding.navDate?.toISOString().slice(0, 10))
        .filter(Boolean),
      summary,
      listedSummary: valuation.summary,
      priceAsOf: valuation.priceAsOf?.toISOString() ?? null,
    };

    return {
      snapshotTime,
      brokerAccountId,
      allocation,
      summary,
      listedSummary: valuation.summary,
      priceAsOf: valuation.priceAsOf,
      mutualFunds,
      warnings,
      source,
    };
  }

  private readAllocation(value: unknown) {
    return value as ReturnType<
      AllocationService['calculateStockEtfCashAllocation']
    >;
  }

  private readSnapshotSource(value: unknown) {
    const source = (value ?? {}) as Record<string, unknown>;
    return {
      brokerProvider:
        typeof source.brokerProvider === 'string'
          ? source.brokerProvider
          : null,
      syncRunId: typeof source.syncRunId === 'string' ? source.syncRunId : null,
      holdingCount:
        typeof source.holdingCount === 'number' ? source.holdingCount : 0,
      fundSnapshotId:
        typeof source.fundSnapshotId === 'string'
          ? source.fundSnapshotId
          : null,
      summary: source.summary as
        | ReturnType<PortfolioSnapshotService['buildSummary']>
        | undefined,
      listedSummary: source.listedSummary as
        | import('./holdings-valuation.service').HoldingsValuationSummary
        | undefined,
      priceAsOf: typeof source.priceAsOf === 'string' ? source.priceAsOf : null,
    };
  }

  private buildSummary(input: {
    listed: import('./holdings-valuation.service').HoldingsValuationSummary;
    mutualFunds: {
      totalValue: number;
      holdings: Array<{ costValue: number | null; pnl: number | null }>;
    };
    cashValue: number;
  }) {
    const listed = input.listed;
    const mfInvested = input.mutualFunds.holdings.reduce(
      (total, holding) => total + (holding.costValue ?? 0),
      0,
    );
    const mfCurrentValue = input.mutualFunds.totalValue;
    const mfPnlSum = input.mutualFunds.holdings.reduce(
      (total, holding) => total + (holding.pnl ?? 0),
      0,
    );
    const cash = roundMoney(input.cashValue);
    const totalInvested = roundMoney(listed.invested + mfInvested + cash);
    const totalCurrentValue = roundMoney(
      listed.currentValue + mfCurrentValue + cash,
    );
    const totalPnl = roundMoney(totalCurrentValue - totalInvested);
    const investedNonCash = totalInvested - cash;
    const totalPnlPercent =
      investedNonCash > 0
        ? roundPercent((totalPnl / investedNonCash) * 100)
        : null;

    return {
      totalInvested,
      totalCurrentValue,
      totalPnl,
      totalPnlPercent,
      dayPnl: listed.dayPnl,
      dayPnlPercent: listed.dayPnlPercent,
      listed: {
        invested: listed.invested,
        currentValue: listed.currentValue,
        pnl: listed.pnl,
        pnlPercent: listed.pnlPercent,
        dayPnl: listed.dayPnl,
        dayPnlPercent: listed.dayPnlPercent,
        stockInvested: listed.stockInvested,
        stockCurrentValue: listed.stockCurrentValue,
        etfInvested: listed.etfInvested,
        etfCurrentValue: listed.etfCurrentValue,
        pricedCount: listed.pricedCount,
        fallbackCount: listed.fallbackCount,
        holdingCount: listed.holdingCount,
      },
      mutualFunds: {
        invested: roundMoney(mfInvested),
        currentValue: roundMoney(mfCurrentValue),
        pnl: roundMoney(mfPnlSum),
        pnlPercent:
          mfInvested > 0 ? roundPercent((mfPnlSum / mfInvested) * 100) : null,
        holdingCount: input.mutualFunds.holdings.length,
      },
      cash,
    };
  }

  private async findFund(userId: string, syncRunId?: string) {
    const effectiveSyncRunId =
      syncRunId ?? (await this.brokerHoldingsQuery.findLatestSyncRunId(userId));

    if (!effectiveSyncRunId) {
      return null;
    }

    return this.prisma.brokerFundSnapshot.findFirst({
      where: { userId, syncRunId: effectiveSyncRunId },
    });
  }

  private buildWarnings(
    holdingCount: number,
    hasFundSnapshot: boolean,
    excludedSoldHoldings = 0,
  ) {
    const warnings: string[] = [];

    if (holdingCount === 0) {
      warnings.push('No synced Dhan holdings are available.');
    }

    if (excludedSoldHoldings > 0) {
      warnings.push(
        `${excludedSoldHoldings} holding(s) sold today were excluded because Dhan holdings lag same-day CNC sells.`,
      );
    }

    if (!hasFundSnapshot) {
      warnings.push('No Dhan fund snapshot is available for cash allocation.');
    }

    return warnings;
  }

  private decimalToNumber(value: DecimalLike | number | null | undefined) {
    if (typeof value === 'number') {
      return value;
    }

    return value?.toNumber() ?? 0;
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

function emptyListedSummary(): import('./holdings-valuation.service').HoldingsValuationSummary {
  return {
    holdingCount: 0,
    pricedCount: 0,
    fallbackCount: 0,
    invested: 0,
    currentValue: 0,
    pnl: 0,
    pnlPercent: null,
    dayPnl: null,
    dayPnlPercent: null,
    stockInvested: 0,
    stockCurrentValue: 0,
    etfInvested: 0,
    etfCurrentValue: 0,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}
