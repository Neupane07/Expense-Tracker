import { Injectable } from '@nestjs/common';
import { BrokerProvider } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDhanTrade } from './dhan-normalizers';
import type { DhanSyncContext } from './dhan-sync.types';
import type { DhanTrade } from './dhan.types';
import { toJsonPayload } from './json';

@Injectable()
export class TradesSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(context: DhanSyncContext, rows: DhanTrade[]) {
    let count = 0;

    for (const row of rows) {
      const normalized = normalizeDhanTrade(row);

      await this.prisma.brokerTradeSnapshot.upsert({
        where: {
          brokerAccountId_exchangeTradeId: {
            brokerAccountId: context.brokerAccountId,
            exchangeTradeId: normalized.exchangeTradeId,
          },
        },
        create: {
          ...context,
          provider: BrokerProvider.DHAN,
          ...normalized,
          rawPayload: toJsonPayload(row),
        },
        update: {
          syncRunId: context.syncRunId,
          asOf: context.asOf,
          provider: BrokerProvider.DHAN,
          ...normalized,
          rawPayload: toJsonPayload(row),
        },
      });
      count += 1;
    }

    return { count };
  }
}
