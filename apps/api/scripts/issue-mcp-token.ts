import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--') {
      continue;
    }

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userEmail = args.userEmail?.trim().toLowerCase();
  const label = args.label?.trim() || 'cli-issued';
  const expiresAt = args.expiresAt ? new Date(args.expiresAt) : null;

  if (!userEmail) {
    throw new Error(
      'Usage: pnpm mcp:issue-token -- --userEmail user@example.com [--label local-dev] [--expiresAt 2026-12-31T00:00:00.000Z]',
    );
  }

  if (expiresAt && Number.isNaN(expiresAt.getTime())) {
    throw new Error('Invalid --expiresAt value.');
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set.');
  }

  const pool = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: pool });

  try {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });

    if (!user) {
      throw new Error(`User not found for email: ${userEmail}`);
    }

    const token = randomBytes(32).toString('base64url');
    const row = await prisma.mcpAccessToken.create({
      data: {
        userId: user.id,
        label,
        tokenHash: hashToken(token),
        tokenPrefix: token.slice(0, 8),
        expiresAt,
      },
    });

    console.log(
      JSON.stringify(
        {
          tokenId: row.id,
          userId: user.id,
          userEmail: user.email,
          tokenPrefix: row.tokenPrefix,
          label: row.label,
          expiresAt: row.expiresAt?.toISOString() ?? null,
          token,
        },
        null,
        2,
      ),
    );
    console.error(
      '\nStore this token securely. It cannot be retrieved again after issuance.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
