import { Injectable } from '@nestjs/common';
import { BrokerProvider } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDhanOrder } from './dhan-normalizers';
import type { DhanSyncContext } from './dhan-sync.types';
import type { DhanOrder } from './dhan.types';
import { toJsonPayload } from './json';

@Injectable()
export class OrdersSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(context: DhanSyncContext, rows: DhanOrder[]) {
    let count = 0;

    for (const row of rows) {
      const normalized = normalizeDhanOrder(row);

      await this.prisma.brokerOrderSnapshot.upsert({
        where: {
          brokerAccountId_orderId: {
            brokerAccountId: context.brokerAccountId,
            orderId: normalized.orderId,
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
