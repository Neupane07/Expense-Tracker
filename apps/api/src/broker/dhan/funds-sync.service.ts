import { Injectable } from '@nestjs/common';
import { BrokerProvider } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDhanFundLimit } from './dhan-normalizers';
import type { DhanSyncContext } from './dhan-sync.types';
import type { DhanFundLimit } from './dhan.types';
import { toJsonPayload } from './json';

@Injectable()
export class FundsSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(context: DhanSyncContext, row: DhanFundLimit) {
    const normalized = normalizeDhanFundLimit(row);

    await this.prisma.brokerFundSnapshot.create({
      data: {
        ...context,
        provider: BrokerProvider.DHAN,
        ...normalized,
        rawPayload: toJsonPayload(row),
      },
    });

    return { count: 1 };
  }
}
