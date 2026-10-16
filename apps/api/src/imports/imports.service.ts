import { SourceDocumentsService } from '../email-capture/source-documents.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ImportStatus, SourceType } from '../generated/prisma/client';
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
    private readonly documents: SourceDocumentsService,
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
    if (file.buffer.length > 15 * 1024 * 1024)
      throw new BadRequestException('File exceeds 15 MB');
    const fileHash = this.hashBuffer(file.buffer);
    const prior = await this.prisma.import.findUnique({
      where: { fileHash_accountId: { fileHash, accountId } },
    });
    if (prior && prior.status !== 'FAILED')
      throw new ConflictException(
        'This file has already been imported for this account.',
      );
    const record =
      prior ??
      (await this.createImportRecord({
        userId,
        accountId,
        sourceType,
        fileName: file.originalname,
        fileHash,
      }));
    try {
      const documentId = await this.documents.ingest({
        userId,
        accountId,
        sourceKey: `upload:${accountId}:${fileHash}`,
        bytes: file.buffer,
        kind: 'UPLOAD',
        fileName: file.originalname,
        mimeType: file.mimetype ?? 'application/octet-stream',
        metadata: { sourceType, importId: record.id },
      });
      const preview = this.parseFileForPreview(file, sourceType);
      const doc = await this.documents.detail(userId, documentId);
      if (doc.errorCode) throw new BadRequestException(doc.errorCode);
      const ids = doc.observations.flatMap((o) =>
        o.transactionId ? [o.transactionId] : [],
      );
      const assigned = await this.prisma.transaction.updateMany({
        where: {
          userId,
          id: { in: ids },
          importId: null,
          transactionHash: { startsWith: 'observation:' },
        },
        data: { importId: record.id },
      });
      const unresolved = doc.observations.filter(
        (o) => !o.transactionId,
      ).length;
      const updated = await this.prisma.import.update({
        where: { id: record.id },
        data: {
          status: unresolved ? ImportStatus.PARSED : ImportStatus.COMPLETED,
          totalRows: preview.stats.totalRowsScanned,
          importedRows: assigned.count,
          duplicateRows: ids.length - assigned.count,
          failedRows: unresolved,
          rawKeyVersion: `source-document:${documentId}`,
          rowErrors: preview.stats.errors,
          errorMessage: unresolved
            ? 'Possible duplicates require resolution in Email intake.'
            : null,
        },
      });
      return {
        ...updated,
        rawFile: undefined,
        importId: record.id,
        errors: preview.stats.errors,
      };
    } catch (error) {
      await this.prisma.import.update({
        where: { id: record.id },
        data: {
          status: ImportStatus.FAILED,
          errorMessage:
            error instanceof Error ? error.message : 'Import failed',
        },
      });
      throw error;
    }
  }

  findAll(userId: string) {
    return this.prisma.import.findMany({
      where: { userId },
      omit: { rawFile: true },
      include: {
        account: { omit: { statementPassword: true } },
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
      omit: { rawFile: true },
      include: {
        account: { omit: { statementPassword: true } },
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
    let tableRows;

    try {
      tableRows = readStatementFile(file.originalname, file.buffer);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Unable to read statement file',
      );
    }

    const parser = this.parserForSourceType(sourceType);
    const preview = parser.parseRows(tableRows);
    const sourceName = this.sourceName(sourceType);

    if (!preview.stats.recognizedTable) {
      throw new BadRequestException(
        `No recognized ${sourceName} transaction table was found. Expected a transaction header row in the uploaded statement.`,
      );
    }

    if (preview.rows.length === 0) {
      throw new BadRequestException(
        `A ${sourceName} transaction table was found, but it contains no valid transaction rows. Check the statement period and file format.`,
      );
    }

    return preview;
  }

  private sourceName(sourceType: SourceType) {
    return sourceType === SourceType.ICICI_BANK
      ? 'ICICI Bank'
      : 'ICICI Amazon Pay Card';
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

  private hashBuffer(buffer: Buffer) {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
