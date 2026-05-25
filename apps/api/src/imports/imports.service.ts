import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SourceType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IciciAmazonCardParser } from './parsers/icici-amazon-card.parser';
import { IciciBankParser } from './parsers/icici-bank.parser';
import { readStatementFile } from './parsers/statement-file.reader';

type ImportPreviewInput = {
  file?: Express.Multer.File;
  sourceType?: string;
  accountId?: string;
};

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly iciciBankParser: IciciBankParser,
    private readonly iciciAmazonCardParser: IciciAmazonCardParser,
  ) {}

  async preview(input: ImportPreviewInput) {
    if (!input.file?.buffer) {
      throw new BadRequestException('file is required');
    }

    if (!input.accountId) {
      throw new BadRequestException('accountId is required');
    }

    const sourceType = this.parseSourceType(input.sourceType);
    const account = await this.prisma.account.findUnique({
      where: {
        id: input.accountId,
      },
    });

    if (!account) {
      throw new NotFoundException(`Account ${input.accountId} was not found`);
    }

    let tableRows;

    try {
      tableRows = readStatementFile(input.file.originalname, input.file.buffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Unable to read statement file',
      );
    }

    const parser = this.parserForSourceType(sourceType);
    const preview = parser.parseRows(tableRows);

    return {
      accountId: input.accountId,
      sourceType,
      ...preview,
    };
  }

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

  private parserForSourceType(sourceType: SourceType) {
    if (sourceType === SourceType.ICICI_BANK) {
      return this.iciciBankParser;
    }

    return this.iciciAmazonCardParser;
  }

  private parseSourceType(sourceType?: string) {
    if (!sourceType) {
      throw new BadRequestException('sourceType is required');
    }

    if (Object.values(SourceType).includes(sourceType as SourceType)) {
      return sourceType as SourceType;
    }

    throw new BadRequestException(`Unsupported sourceType: ${sourceType}`);
  }
}
