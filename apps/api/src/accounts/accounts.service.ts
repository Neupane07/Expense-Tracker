import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AccountType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateAccountInput = {
  name?: string;
  institution?: string;
  type?: string;
  lastFour?: string | null;
};

const createAccountSchema = z.object({
  name: z.string().trim().min(1, 'name is required').max(80),
  institution: z.string().trim().min(1, 'institution is required').max(80),
  type: z.enum(AccountType, { error: 'Unsupported account type' }),
  lastFour: z
    .string()
    .trim()
    .max(32, 'reference id must be 32 characters or fewer')
    .optional()
    .nullable(),
});

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.account.findMany({
      where: { userId },
      orderBy: [
        {
          type: 'asc',
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  create(userId: string, input: CreateAccountInput) {
    const result = createAccountSchema.safeParse(input);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }

    return this.prisma.account.create({
      data: {
        userId,
        name: result.data.name,
        institution: result.data.institution,
        type: result.data.type,
        lastFour: result.data.lastFour || null,
      },
    });
  }
}
