import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.import.findMany({
      include: {
        account: true,
        _count: {
          select: {
            transactions: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const importRecord = await this.prisma.import.findUnique({
      where: { id },
      include: {
        account: true,
        transactions: {
          include: {
            category: true,
          },
          orderBy: {
            transactionDate: 'desc',
          },
        },
      },
    });

    if (!importRecord) {
      throw new NotFoundException(`Import ${id} was not found`);
    }

    return importRecord;
  }
}
