import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BrokerProvider } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BrokerCredentialsService } from './broker-credentials.service';
import { DhanClient } from './dhan/dhan.client';
import { FundsSyncService } from './dhan/funds-sync.service';
import { HoldingsSyncService } from './dhan/holdings-sync.service';
import { OrdersSyncService } from './dhan/orders-sync.service';
import { PositionsSyncService } from './dhan/positions-sync.service';
import { TradesSyncService } from './dhan/trades-sync.service';

@Injectable()
export class BrokerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brokerCredentials: BrokerCredentialsService,
    private readonly dhanClient: DhanClient,
    private readonly holdingsSync: HoldingsSyncService,
    private readonly positionsSync: PositionsSyncService,
    private readonly ordersSync: OrdersSyncService,
    private readonly tradesSync: TradesSyncService,
    private readonly fundsSync: FundsSyncService,
  ) {}

  getStatus() {
    return {
      module: 'broker',
      status: 'read-only',
      providers: ['DHAN'],
    };
  }

  async syncDhan(userId: string) {
    const asOf = new Date();
    const syncRunId = randomUUID();
    const [
      holdingsResponse,
      positionsResponse,
      ordersResponse,
      tradesResponse,
      fundResponse,
    ] = await Promise.all([
      this.dhanClient.getHoldings(userId),
      this.dhanClient.getPositions(userId),
      this.dhanClient.getOrders(userId),
      this.dhanClient.getTrades(userId),
      this.dhanClient.getFundLimit(userId),
    ]);

    const holdings = Array.isArray(holdingsResponse) ? holdingsResponse : [];
    const positions = Array.isArray(positionsResponse) ? positionsResponse : [];
    const orders = Array.isArray(ordersResponse) ? ordersResponse : [];
    const trades = Array.isArray(tradesResponse) ? tradesResponse : [];
    const fund = fundResponse ?? {};
    const dhanClientId = await this.resolveDhanClientId(userId, {
      fund,
      positions,
      orders,
      trades,
    });
    const brokerAccount = await this.prisma.brokerAccount.upsert({
      where: {
        userId_provider_dhanClientId: {
          userId,
          provider: BrokerProvider.DHAN,
          dhanClientId,
        },
      },
      create: {
        userId,
        provider: BrokerProvider.DHAN,
        dhanClientId,
        displayName: `Dhan ${dhanClientId}`,
      },
      update: {
        isActive: true,
        displayName: `Dhan ${dhanClientId}`,
      },
    });
    const context = {
      userId,
      brokerAccountId: brokerAccount.id,
      syncRunId,
      asOf,
    };

    const [
      holdingResult,
      positionResult,
      orderResult,
      tradeResult,
      fundResult,
    ] = await Promise.all([
      this.holdingsSync.sync(context, holdings),
      this.positionsSync.sync(context, positions),
      this.ordersSync.sync(context, orders),
      this.tradesSync.sync(context, trades),
      this.fundsSync.sync(context, fund),
    ]);
    await this.brokerCredentials.markDhanSynced(userId);

    return {
      syncRunId,
      asOf,
      brokerAccountId: brokerAccount.id,
      provider: BrokerProvider.DHAN,
      counts: {
        holdings: holdingResult.count,
        positions: positionResult.count,
        orders: orderResult.count,
        trades: tradeResult.count,
        funds: fundResult.count,
      },
    };
  }

  async validateDhan(userId: string) {
    await this.dhanClient.getFundLimit(userId);
    return this.brokerCredentials.markDhanValidated(userId);
  }

  private async resolveDhanClientId(
    userId: string,
    input: {
      fund: { dhanClientId?: string };
      positions: Array<{ dhanClientId?: string }>;
      orders: Array<{ dhanClientId?: string }>;
      trades: Array<{ dhanClientId?: string }>;
    },
  ) {
    const clientId =
      (await this.dhanClient.getConfiguredClientId(userId)) ??
      input.fund.dhanClientId ??
      input.positions.find((row) => row.dhanClientId)?.dhanClientId ??
      input.orders.find((row) => row.dhanClientId)?.dhanClientId ??
      input.trades.find((row) => row.dhanClientId)?.dhanClientId;

    if (!clientId) {
      throw new BadRequestException(
        'Dhan client id is required when Dhan responses do not include a client id',
      );
    }

    return clientId;
  }
}
