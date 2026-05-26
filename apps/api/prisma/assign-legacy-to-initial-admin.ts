import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Role, PrismaClient } from '../src/generated/prisma/client';

const LEGACY_OWNER_ID = 'legacy_unassigned_owner';
const databaseUrl = process.env.DATABASE_URL;
const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();

if (!databaseUrl || !initialAdminEmail) {
  throw new Error('DATABASE_URL and INITIAL_ADMIN_EMAIL are required.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  const admin = await prisma.user.findUnique({
    where: { email: initialAdminEmail },
  });

  if (!admin || admin.role !== Role.ADMIN || !admin.googleSubject) {
    throw new Error(
      'The configured initial administrator must complete Google sign-in before legacy data can be assigned.',
    );
  }

  const counts = await prisma.$transaction(async (transaction) => {
    const [accounts, imports, transactions, rules] = await Promise.all([
      transaction.account.count({ where: { userId: LEGACY_OWNER_ID } }),
      transaction.import.count({ where: { userId: LEGACY_OWNER_ID } }),
      transaction.transaction.count({ where: { userId: LEGACY_OWNER_ID } }),
      transaction.rule.count({ where: { userId: LEGACY_OWNER_ID } }),
    ]);

    await transaction.account.updateMany({
      where: { userId: LEGACY_OWNER_ID },
      data: { userId: admin.id },
    });
    await transaction.import.updateMany({
      where: { userId: LEGACY_OWNER_ID },
      data: { userId: admin.id },
    });
    await transaction.transaction.updateMany({
      where: { userId: LEGACY_OWNER_ID },
      data: { userId: admin.id },
    });
    await transaction.rule.updateMany({
      where: { userId: LEGACY_OWNER_ID },
      data: { userId: admin.id },
    });

    return { accounts, imports, transactions, rules };
  });

  console.log(
    `Assigned legacy data to ${admin.email}: ${counts.accounts} accounts, ${counts.imports} imports, ${counts.transactions} transactions, ${counts.rules} rules.`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
