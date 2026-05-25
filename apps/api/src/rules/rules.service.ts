import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.rule.findMany({
      orderBy: [
        {
          priority: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const rule = await this.prisma.rule.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            categories: true,
          },
        },
      },
    });

    if (!rule) {
      throw new NotFoundException(`Rule ${id} was not found`);
    }

    return rule;
  }
}
