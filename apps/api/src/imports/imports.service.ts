import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  ExpenseType,
  ImportStatus,
  MatchType,
  Rule,
  SourceType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IciciAmazonCardParser } from './parsers/icici-amazon-card.parser';
import { IciciBankParser } from './parsers/icici-bank.parser';
import { ParsedStatementRow } from './parsers/statement-parser.interface';
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

  async preview(userId: string, input: ImportPreviewInput) {
    const { file, sourceType, accountId } = await this.validateImportInput(
      userId,
      input,
    );
    const preview = this.parseFileForPreview(file, sourceType);

    return {
      accountId,
      sourceType,
      ...preview,
    };
  }

  async create(userId: string, input: ImportPreviewInput) {
    const { file, sourceType, accountId } = await this.validateImportInput(
      userId,
      input,
    );
    const fileHash = this.hashBuffer(file.buffer);
    const importRecord = await this.createImportRecord({
      accountId,
      userId,
      sourceType,
      fileName: file.originalname,
      fileHash,
    });

    try {
      const preview = this.parseFileForPreview(file, sourceType);
      const rules = await this.prisma.rule.findMany({
        where: {
          userId,
          isActive: true,
        },
        orderBy: [
          {
            priority: 'asc',
          },
          {
            createdAt: 'asc',
          },
        ],
      });
      const existingHashes = new Set(
        (
          await this.prisma.transaction.findMany({
            where: {
              userId,
              transactionHash: {
                in: preview.rows.map((row) =>
                  this.createTransactionHash(accountId, row),
                ),
              },
            },
            select: {
              transactionHash: true,
            },
          })
        ).map((transaction) => transaction.transactionHash),
      );
      const seenHashes = new Set<string>();
      let importedRows = 0;
      let duplicateRows = 0;
      let failedRows = preview.stats.errors.length;

      for (const row of preview.rows) {
        const transactionHash = this.createTransactionHash(accountId, row);

        if (
          existingHashes.has(transactionHash) ||
          seenHashes.has(transactionHash)
        ) {
          duplicateRows += 1;
          continue;
        }

        try {
          const matchedRule = this.findMatchingRule(
            rules,
            row.descriptionClean,
          );
          const transaction = await this.prisma.transaction.create({
            data: {
              userId,
              accountId,
              importId: importRecord.id,
              transactionDate: this.parseTransactionDate(row.transactionDate),
              descriptionRaw: row.descriptionRaw,
              descriptionClean: row.descriptionClean,
              moneyOut: row.moneyOut,
              moneyIn: row.moneyIn,
              netAmount: row.netAmount,
              balance: row.balance,
              referenceNumber: row.referenceNumber,
              transactionHash,
              sourceType,
              paymentMethod: row.paymentMethod,
            },
          });

          await this.prisma.transactionCategory.create({
            data: matchedRule
              ? {
                  transactionId: transaction.id,
                  vendor: matchedRule.vendor,
                  category: matchedRule.category,
                  subcategory: matchedRule.subcategory,
                  expenseType: matchedRule.expenseType,
                  ruleId: matchedRule.id,
                  confidence: 100,
                  isManual: false,
                }
              : {
                  transactionId: transaction.id,
                  vendor: 'Manual Review',
                  category: 'Manual Review',
                  expenseType: ExpenseType.REVIEW,
                  confidence: 0,
                  isManual: false,
                  notes: 'No matching rule found during import.',
                },
          });

          seenHashes.add(transactionHash);
          importedRows += 1;
        } catch {
          failedRows += 1;
        }
      }

      const updatedImport = await this.prisma.import.update({
        where: {
          id: importRecord.id,
        },
        data: {
          status: ImportStatus.COMPLETED,
          statementFrom: this.getStatementBoundary(preview.rows, 'from'),
          statementTo: this.getStatementBoundary(preview.rows, 'to'),
          totalRows: preview.stats.totalRowsScanned,
          importedRows,
          duplicateRows,
          failedRows,
        },
      });

      return {
        importId: updatedImport.id,
        accountId,
        sourceType,
        fileName: updatedImport.fileName,
        status: updatedImport.status,
        totalRows: updatedImport.totalRows,
        importedRows: updatedImport.importedRows,
        duplicateRows: updatedImport.duplicateRows,
        failedRows: updatedImport.failedRows,
        errors: preview.stats.errors,
      };
    } catch (error) {
      await this.prisma.import.update({
        where: {
          id: importRecord.id,
        },
        data: {
          status: ImportStatus.FAILED,
          errorMessage:
            error instanceof Error
              ? error.message
              : 'Failed to import statement',
        },
      });

      throw error;
    }
  }

  findAll(userId: string) {
    return this.prisma.import.findMany({
      where: { userId },
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

  async findOne(userId: string, id: string) {
    const importRecord = await this.prisma.import.findUnique({
      where: { id_userId: { id, userId } },
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

  private async validateImportInput(userId: string, input: ImportPreviewInput) {
    if (!input.file?.buffer) {
      throw new BadRequestException('file is required');
    }

    if (!input.accountId) {
      throw new BadRequestException('accountId is required');
    }

    const sourceType = this.parseSourceType(input.sourceType);
    const account = await this.prisma.account.findUnique({
      where: {
        id_userId: {
          id: input.accountId,
          userId,
        },
      },
    });

    if (!account) {
      throw new NotFoundException(`Account ${input.accountId} was not found`);
    }

    return {
      file: input.file,
      sourceType,
      accountId: input.accountId,
    };
  }

  private parseFileForPreview(
    file: Express.Multer.File,
    sourceType: SourceType,
  ) {
    try {
      const tableRows = readStatementFile(file.originalname, file.buffer);
      const parser = this.parserForSourceType(sourceType);
      return parser.parseRows(tableRows);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Unable to read statement file',
      );
    }
  }

  private async createImportRecord(input: {
    userId: string;
    accountId: string;
    sourceType: SourceType;
    fileName: string;
    fileHash: string;
  }) {
    try {
      return await this.prisma.import.create({
        data: {
          userId: input.userId,
          accountId: input.accountId,
          sourceType: input.sourceType,
          fileName: input.fileName,
          fileHash: input.fileHash,
          status: ImportStatus.PENDING,
        },
      });
    } catch {
      throw new ConflictException(
        'This file has already been imported for this account.',
      );
    }
  }

  private createTransactionHash(accountId: string, row: ParsedStatementRow) {
    const parts = [
      accountId,
      row.transactionDate,
      row.descriptionClean.toLowerCase(),
      row.moneyOut.toFixed(2),
      row.moneyIn.toFixed(2),
      row.referenceNumber?.trim().toLowerCase() ?? '',
    ];

    return createHash('sha256').update(parts.join('|')).digest('hex');
  }

  private hashBuffer(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private findMatchingRule(rules: Rule[], description: string) {
    return rules.find((rule) => this.ruleMatches(rule, description));
  }

  private ruleMatches(rule: Rule, description: string) {
    const normalizedDescription = description.toLowerCase();
    const normalizedPattern = rule.pattern.toLowerCase();

    switch (rule.matchType) {
      case MatchType.CONTAINS:
        return normalizedDescription.includes(normalizedPattern);
      case MatchType.EXACT:
        return normalizedDescription === normalizedPattern;
      case MatchType.STARTS_WITH:
        return normalizedDescription.startsWith(normalizedPattern);
      case MatchType.REGEX:
        try {
          return new RegExp(rule.pattern, 'i').test(description);
        } catch {
          return false;
        }
    }
  }

  private parseTransactionDate(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private getStatementBoundary(
    rows: ParsedStatementRow[],
    boundary: 'from' | 'to',
  ) {
    if (rows.length === 0) {
      return null;
    }

    const timestamps = rows.map((row) =>
      this.parseTransactionDate(row.transactionDate).getTime(),
    );
    const timestamp =
      boundary === 'from' ? Math.min(...timestamps) : Math.max(...timestamps);

    return new Date(timestamp);
  }
}
