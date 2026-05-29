import { Injectable } from '@nestjs/common';
import { BrokerProvider, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AllocationService } from './allocation.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class PortfolioSnapshotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly allocationService: AllocationService,
  ) {}

  async createSnapshotFromLatest(userId: string, syncRunId?: string) {
    const holdings = await this.findHoldings(userId, syncRunId);
    const fund = await this.findFund(userId, syncRunId);
    const cashValue = this.decimalToNumber(fund?.availableBalance);
    const allocation = this.allocationService.calculateStockEtfCashAllocation(
      holdings.map((holding) => ({
        assetClass: holding.assetClass,
        marketValue: this.decimalToNumber(holding.marketValue),
      })),
      cashValue,
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
    const warnings = this.buildWarnings(holdings.length, fund !== null);
    const snapshot = await this.prisma.portfolioSnapshot.create({
      data: {
        userId,
        brokerAccountId,
        snapshotTime: new Date(),
        totalStockValue: allocation.stockValue,
        totalEtfValue: allocation.etfValue,
        totalCashValue: allocation.cashValue,
        totalValue: allocation.totalValue,
        allocation: this.toJson(allocation),
        source: this.toJson({
          brokerProvider: BrokerProvider.DHAN,
          syncRunId: syncRunId ?? null,
          holdingCount: holdings.length,
          fundSnapshotId: fund?.id ?? null,
        }),
        warnings,
      },
    });

    return {
      id: snapshot.id,
      snapshotTime: snapshot.snapshotTime,
      brokerAccountId: snapshot.brokerAccountId,
      allocation,
      warnings,
      source: {
        brokerProvider: BrokerProvider.DHAN,
        syncRunId: syncRunId ?? null,
        holdingCount: holdings.length,
        fundSnapshotId: fund?.id ?? null,
      },
    };
  }

  private async findHoldings(userId: string, syncRunId?: string) {
    if (syncRunId) {
      return this.prisma.brokerHoldingSnapshot.findMany({
        where: { userId, syncRunId },
        orderBy: { tradingSymbol: 'asc' },
      });
    }

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

  private findFund(userId: string, syncRunId?: string) {
    return this.prisma.brokerFundSnapshot.findFirst({
      where: syncRunId ? { userId, syncRunId } : { userId },
      orderBy: { asOf: 'desc' },
    });
  }

  private buildWarnings(holdingCount: number, hasFundSnapshot: boolean) {
    const warnings: string[] = [];

    if (holdingCount === 0) {
      warnings.push('No synced Dhan holdings are available.');
    } else {
      warnings.push(
        'Holding market values use Dhan average cost until market prices are added.',
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
