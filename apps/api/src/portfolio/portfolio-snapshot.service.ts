import { Injectable } from '@nestjs/common';
import { BrokerHoldingsQueryService } from '../broker/broker-holdings-query.service';
import { BrokerProvider, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from './allocation.service';
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
  ) {}

  async createSnapshotFromLatest(userId: string, syncRunId?: string) {
    const { holdings, excludedCount } =
      await this.brokerHoldingsQuery.findReconciledHoldings(userId, syncRunId);
    const fund = await this.findFund(userId, syncRunId);
    const mutualFunds = await this.mutualFundsService.getValuations(userId);
    const cashValue = this.decimalToNumber(fund?.availableBalance);
    const allocation = this.allocationService.calculateStockEtfCashAllocation(
      holdings.map((holding) => ({
        assetClass: holding.assetClass,
        marketValue: this.decimalToNumber(holding.marketValue),
      })),
      cashValue,
      mutualFunds.totalValue,
    );
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
    const warnings = [
      ...this.buildWarnings(holdings.length, fund !== null, excludedCount),
      ...mutualFunds.warnings,
    ];
    const snapshot = await this.prisma.portfolioSnapshot.create({
      data: {
        userId,
        brokerAccountId,
        snapshotTime: new Date(),
        totalStockValue: allocation.stockValue,
        totalEtfValue: allocation.etfValue,
        totalMfValue: allocation.mutualFundValue,
        totalCashValue: allocation.cashValue,
        totalValue: allocation.totalValue,
        allocation: this.toJson(allocation),
        source: this.toJson({
          brokerProvider: BrokerProvider.DHAN,
          syncRunId: syncRunId ?? null,
          holdingCount: holdings.length,
          fundSnapshotId: fund?.id ?? null,
          mutualFundHoldingCount: mutualFunds.holdings.length,
          mutualFundNavDates: mutualFunds.holdings
            .map((holding) => holding.navDate?.toISOString().slice(0, 10))
            .filter(Boolean),
        }),
        warnings,
      },
    });

    return {
      id: snapshot.id,
      snapshotTime: snapshot.snapshotTime,
      brokerAccountId: snapshot.brokerAccountId,
      allocation,
      mutualFunds,
      warnings,
      source: {
        brokerProvider: BrokerProvider.DHAN,
        syncRunId: syncRunId ?? null,
        holdingCount: holdings.length,
        fundSnapshotId: fund?.id ?? null,
        mutualFundHoldingCount: mutualFunds.holdings.length,
      },
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
    } else {
      warnings.push(
        'Holding market values use Dhan average cost until market prices are added.',
      );
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
