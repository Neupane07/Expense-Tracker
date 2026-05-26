/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { NotFoundException } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

describe('TransactionsService ownership', () => {
  it('scopes list filters to the authenticated user regardless of query input', () => {
    const prisma = {
      transaction: { findMany: jest.fn() },
    };
    const service = new TransactionsService(prisma as never);

    void service.findAll('member-a', { search: 'member-b' });

    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'member-a' }),
      }),
    );
  });

  it('does not return another user transaction by guessed id', async () => {
    const prisma = {
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new TransactionsService(prisma as never);

    await expect(
      service.findOne('member-a', 'member-b-transaction'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.transaction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'member-b-transaction', userId: 'member-a' },
      }),
    );
  });

  it('does not mutate another user transaction by guessed id', async () => {
    const prisma = {
      transaction: { findFirst: jest.fn().mockResolvedValue(null) },
      transactionCategory: { upsert: jest.fn() },
    };
    const service = new TransactionsService(prisma as never);

    await expect(
      service.updateCategory('member-a', 'member-b-transaction', {
        vendor: 'Vendor',
        category: 'Food',
        expenseType: 'EXPENSE',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.transactionCategory.upsert).not.toHaveBeenCalled();
  });
});
