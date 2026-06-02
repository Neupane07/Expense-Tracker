import { Injectable } from '@nestjs/common';
import type { BrokerHoldingSnapshot } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { reconcileDhanHoldings } from './dhan/holdings-reconciliation';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class BrokerHoldingsQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestSyncRunId(userId: string) {
    const latestFundSnapshot = await this.prisma.brokerFundSnapshot.findFirst({
      where: { userId },
      orderBy: [{ asOf: 'desc' }, { createdAt: 'desc' }],
      select: { syncRunId: true },
    });

    return latestFundSnapshot?.syncRunId ?? null;
  }

  async findReconciledHoldings(userId: string, syncRunId?: string) {
    const effectiveSyncRunId =
      syncRunId ?? (await this.findLatestSyncRunId(userId));

    if (!effectiveSyncRunId) {
      return {
        syncRunId: null,
        asOf: null,
        holdings: [] as BrokerHoldingSnapshot[],
        excludedCount: 0,
      };
    }

    const [rawHoldings, positions, orders, fundSnapshot] = await Promise.all([
      this.prisma.brokerHoldingSnapshot.findMany({
        where: { userId, syncRunId: effectiveSyncRunId },
        orderBy: { tradingSymbol: 'asc' },
      }),
      this.prisma.brokerPositionSnapshot.findMany({
        where: { userId, syncRunId: effectiveSyncRunId },
      }),
      this.prisma.brokerOrderSnapshot.findMany({
        where: { userId, syncRunId: effectiveSyncRunId },
      }),
      this.prisma.brokerFundSnapshot.findFirst({
        where: { userId, syncRunId: effectiveSyncRunId },
        select: { asOf: true },
      }),
    ]);
    const syncAsOf =
      fundSnapshot?.asOf ?? rawHoldings[0]?.asOf ?? orders[0]?.asOf ?? new Date();
    const reconciled = reconcileDhanHoldings(
      rawHoldings.map((holding) => ({
        ...holding,
        totalQty: this.decimalToNumber(holding.totalQty),
        availableQty: this.decimalToNumber(holding.availableQty),
        costValue: this.decimalToNumber(holding.costValue),
        marketValue: this.decimalToNumber(holding.marketValue),
      })),
      positions.map((position) => ({
        tradingSymbol: position.tradingSymbol,
        securityId: position.securityId,
        productType: position.productType,
        netQty: this.decimalToNumber(position.netQty),
        daySellQty: this.decimalToNumber(position.daySellQty),
        sellQty: this.decimalToNumber(position.sellQty),
      })),
      orders.map((order) => ({
        tradingSymbol: order.tradingSymbol,
        securityId: order.securityId,
        orderStatus: order.orderStatus,
        transactionType: order.transactionType,
        productType: order.productType,
        filledQty: this.decimalToNumber(order.filledQty),
        updateTime: order.updateTime,
        exchangeTime: order.exchangeTime,
      })),
      syncAsOf,
    );

    return {
      syncRunId: effectiveSyncRunId,
      asOf: syncAsOf,
      holdings: reconciled,
      excludedCount: rawHoldings.length - reconciled.length,
    };
  }

  private decimalToNumber(value: DecimalLike | null | undefined) {
    return value?.toNumber() ?? 0;
  }
}
