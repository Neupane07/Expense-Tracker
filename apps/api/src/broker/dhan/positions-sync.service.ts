import { Injectable } from '@nestjs/common';
import { BrokerProvider } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDhanPosition } from './dhan-normalizers';
import type { DhanSyncContext } from './dhan-sync.types';
import type { DhanPosition } from './dhan.types';
import { toJsonPayload } from './json';

@Injectable()
export class PositionsSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async sync(context: DhanSyncContext, rows: DhanPosition[]) {
    if (rows.length === 0) {
      return { count: 0 };
    }

    const data = rows.map((row) => {
      const normalized = normalizeDhanPosition(row);

      return {
        ...context,
        provider: BrokerProvider.DHAN,
        ...normalized,
        rawPayload: toJsonPayload(row),
      };
    });

    const result = await this.prisma.brokerPositionSnapshot.createMany({
      data,
    });

    return { count: result.count };
  }
}
