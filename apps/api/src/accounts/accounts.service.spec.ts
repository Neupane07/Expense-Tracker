import { BadRequestException } from '@nestjs/common';
import { AccountType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountsService } from './accounts.service';

describe('AccountsService', () => {
  it('creates a user-owned account with trimmed input', async () => {
    const prisma = {
      account: {
        create: jest.fn().mockResolvedValue({ id: 'account-1' }),
        findMany: jest.fn(),
      },
    };
    const service = new AccountsService(prisma as unknown as PrismaService);

    await service.create('user-1', {
      name: ' ICICI Bank Account ',
      institution: ' ICICI Bank ',
      type: AccountType.BANK_ACCOUNT,
      lastFour: ' 1234 ',
    });

    expect(prisma.account.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'ICICI Bank Account',
        institution: 'ICICI Bank',
        type: AccountType.BANK_ACCOUNT,
        lastFour: '1234',
      },
    });
  });

  it('rejects invalid account type', () => {
    const service = new AccountsService({
      account: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as unknown as PrismaService);

    expect(() =>
      service.create('user-1', {
        name: 'Account',
        institution: 'Institution',
        type: 'WALLET',
      }),
    ).toThrow(BadRequestException);
  });
});
