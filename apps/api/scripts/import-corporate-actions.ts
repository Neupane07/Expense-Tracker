import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { CorporateActionPolicyService } from '../src/market-data/corporate-action-policy.service';
import {
  CorporateActionImportService,
  CorporateActionInvalidationService,
} from '../src/market-data/corporate-action.service';
import { corporateActionImportSchema } from '../src/market-data/corporate-action.dto';

async function main() {
  const fileArg = process.argv.find((arg) => arg.startsWith('--file='));

  if (!fileArg) {
    throw new Error('Usage: pnpm corporate-actions:import -- --file=events.json');
  }

  const filePath = fileArg.slice('--file='.length);
  const raw = readFileSync(filePath, 'utf8');
  const parsed = corporateActionImportSchema.parse(JSON.parse(raw));

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  const policy = new CorporateActionPolicyService();
  const invalidation = new CorporateActionInvalidationService(prisma, policy);
  const importService = new CorporateActionImportService(
    prisma,
    policy,
    invalidation,
  );

  try {
    const result = await importService.importEvents(parsed.events);
    console.log(
      JSON.stringify(
        {
          status: result.run.status,
          importedCount: result.importedCount,
          skippedCount: result.skippedCount,
          correctedCount: result.correctedCount,
          errors: result.errors,
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
