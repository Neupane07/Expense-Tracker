import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.account.findMany({
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
}
