import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { InstrumentMasterSyncService } from '../src/market-data/instrument-master-sync.service';
import { ConfigService } from '@nestjs/config';

async function main() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  const configService = new ConfigService();
  const syncService = new InstrumentMasterSyncService(prisma, configService);

  try {
    const force = process.argv.includes('--force');
    const result = await syncService.syncFromProvider({ force });

    console.log(
      JSON.stringify(
        {
          status: result.run.status,
          idempotentSkip: result.idempotentSkip,
          rowCount: result.run.rowCount,
          upsertedCount: result.run.upsertedCount,
          deactivatedCount: result.run.deactivatedCount,
          conflictCount: result.run.conflictCount,
          completedAt: result.run.completedAt,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
