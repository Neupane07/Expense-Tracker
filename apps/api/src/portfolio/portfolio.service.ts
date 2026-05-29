import { Injectable } from '@nestjs/common';
import { BrokerService } from '../broker/broker.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

type DecimalLike = {
  toNumber(): number;
};

@Injectable()
export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerService: BrokerService,
    private readonly portfolioSnapshotService: PortfolioSnapshotService,
  ) {}

  getStatus() {
    return {
      module: 'portfolio',
      status: 'read-only',
    };
  }

  getSnapshot(userId: string) {
    return this.portfolioSnapshotService.createSnapshotFromLatest(userId);
  }

  async syncDhan(userId: string) {
    const sync = await this.brokerService.syncDhan(userId);
    const snapshot =
      await this.portfolioSnapshotService.createSnapshotFromLatest(
        userId,
        sync.syncRunId,
      );

    return {
      sync,
      snapshot,
    };
  }

  async getHoldings(userId: string) {
    const latest = await this.prisma.brokerHoldingSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return [];
    }

    const rows = await this.prisma.brokerHoldingSnapshot.findMany({
      where: { userId, asOf: latest._max.asOf },
      orderBy: { tradingSymbol: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      asOf: row.asOf,
      brokerAccountId: row.brokerAccountId,
      exchange: row.exchange,
      tradingSymbol: row.tradingSymbol,
      securityId: row.securityId,
      isin: row.isin,
      assetClass: row.assetClass,
      totalQty: this.decimalToNumber(row.totalQty),
      availableQty: this.decimalToNumber(row.availableQty),
      avgCostPrice: this.decimalToNumber(row.avgCostPrice),
      costValue: this.decimalToNumber(row.costValue),
      marketValue: this.decimalToNumber(row.marketValue),
      rawPayload: row.rawPayload,
    }));
  }

  async getOrders(userId: string) {
    const rows = await this.prisma.brokerOrderSnapshot.findMany({
      where: { userId },
      orderBy: [{ updateTime: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });

    return rows.map((row) => ({
      id: row.id,
      asOf: row.asOf,
      brokerAccountId: row.brokerAccountId,
      orderId: row.orderId,
      orderStatus: row.orderStatus,
      transactionType: row.transactionType,
      exchangeSegment: row.exchangeSegment,
      productType: row.productType,
      orderType: row.orderType,
      tradingSymbol: row.tradingSymbol,
      securityId: row.securityId,
      quantity: this.decimalToNumber(row.quantity),
      price: this.decimalToNumber(row.price),
      averageTradedPrice: this.decimalToNumber(row.averageTradedPrice),
      filledQty: this.decimalToNumber(row.filledQty),
      remainingQuantity: this.decimalToNumber(row.remainingQuantity),
      createTime: row.createTime,
      updateTime: row.updateTime,
      exchangeTime: row.exchangeTime,
      rawPayload: row.rawPayload,
    }));
  }

  private decimalToNumber(value: DecimalLike | null | undefined) {
    return value?.toNumber() ?? 0;
  }
}
