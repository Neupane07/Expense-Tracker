import {
  DocumentContentStorage,
  PostgresDocumentContentStorage,
} from './document-content-storage';
import { IciciBankParser } from '../imports/parsers/icici-bank.parser';
import { IciciAmazonCardParser } from '../imports/parsers/icici-amazon-card.parser';
import { readStatementFile } from '../imports/parsers/statement-file.reader';
import { merchantKey } from '../expense-core/expense-validation';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ExpenseCryptoService } from '../expense-core/expense-crypto.service';
import { parseInput } from '../expense-core/expense-validation';
import { classify } from '../expense-core/classify';
import {
  observationSchema,
  Observation,
  parseAlert,
  parseStatementText,
} from './expense-parser';
import { readPdf } from './pdf-reader';

const json = (data: unknown) =>
  JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
@Injectable()
export class SourceDocumentsService {
  private readonly storage: DocumentContentStorage;
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ExpenseCryptoService,
    private readonly config: ConfigService,
  ) {
    this.storage = new PostgresDocumentContentStorage(crypto);
  }
  async list(userId: string, input: unknown = {}) {
    const { offset } = parseInput(
      z.object({
        offset: z.coerce.number().int().min(0).max(1000000).default(0),
      }),
      input,
    );
    return this.prisma.sourceDocument.findMany({
      where: { userId },
      omit: { encryptedBytes: true, metadata: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: 200,
      include: { _count: { select: { observations: true } } },
    });
  }
  async detail(userId: string, id: string) {
    const row = await this.prisma.sourceDocument.findFirst({
      where: { id, userId },
      omit: { encryptedBytes: true },
      include: { observations: true },
    });
    if (!row) throw new NotFoundException('Document not found');
    return row;
  }
  async raw(userId: string, id: string) {
    const doc = await this.prisma.sourceDocument.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!doc?.encryptedBytes) throw new NotFoundException('Source unavailable');
    return {
      bytes: this.storage.load(doc.encryptedBytes),
      mime: doc.mimeType,
    };
  }
  async ingest(input: {
    userId: string;
    connectionId?: string;
    generation?: number;
    accountId?: string;
    sourceKey: string;
    bytes: Buffer;
    kind: string;
    fileName: string;
    mimeType: string;
    metadata: Record<string, unknown>;
  }) {
    if (input.bytes.length > 15 * 1024 * 1024)
      throw new BadRequestException('DOCUMENT_TOO_LARGE');
    const contentHash = createHash('sha256').update(input.bytes).digest('hex');
    const suppressed = await this.prisma.sourceDocument.findFirst({
      where: { userId: input.userId, contentHash, deletedAt: { not: null } },
      select: { id: true },
    });
    if (suppressed) return suppressed.id;
    const doc = await this.prisma.$transaction(async (tx) => {
      if (input.connectionId) {
        const connections = await tx.$queryRaw<
          Array<{ generation: number; status: string }>
        >`SELECT "generation", "status" FROM "EmailConnection" WHERE "id" = ${input.connectionId} AND "userId" = ${input.userId} FOR UPDATE`;
        const connection = connections[0];
        if (
          !connection ||
          connection.generation !== input.generation ||
          !['ACTIVE', 'PREVIEW'].includes(connection.status)
        )
          throw new ConflictException('Connection changed');
      }
      const retained = await tx.sourceDocument.upsert({
        where: {
          userId_sourceKey: {
            userId: input.userId,
            sourceKey: input.sourceKey,
          },
        },
        update: {},
        create: {
          userId: input.userId,
          connectionId: input.connectionId,
          accountId: input.accountId,
          sourceKey: input.sourceKey,
          contentHash: createHash('sha256').update(input.bytes).digest('hex'),
          kind: input.kind,
          fileName: input.fileName,
          mimeType: input.mimeType,
          metadata: json(input.metadata),
        },
      });
      if (
        !retained.encryptedBytes &&
        !retained.deletedAt &&
        retained.status === 'PENDING'
      )
        await this.storage.retain(tx, retained.id, input.bytes);
      return retained;
    });
    if (!doc.deletedAt && ['PENDING', 'READY'].includes(doc.status))
      await this.process(input.userId, doc.id);
    return doc.id;
  }
  async recordRejected(input: {
    userId: string;
    connectionId: string;
    generation: number;
    sourceKey: string;
    fileName: string;
    errorCode: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const connections = await tx.$queryRaw<
        Array<{ generation: number; status: string }>
      >`SELECT "generation", "status" FROM "EmailConnection" WHERE "id" = ${input.connectionId} AND "userId" = ${input.userId} FOR UPDATE`;
      const connection = connections[0];
      if (
        !connection ||
        connection.generation !== input.generation ||
        !['ACTIVE', 'PREVIEW'].includes(connection.status)
      )
        throw new ConflictException('Connection changed');
      const { generation: _generation, errorCode, ...identity } = input;
      void _generation;
      return tx.sourceDocument.upsert({
        where: {
          userId_sourceKey: {
            userId: input.userId,
            sourceKey: input.sourceKey,
          },
        },
        update: {},
        create: {
          ...identity,
          errorCode,
          contentHash: `unavailable:${input.sourceKey}`,
          kind: 'STATEMENT',
          mimeType: 'application/pdf',
          metadata: { originalFileAvailable: false },
          status: 'UNSUPPORTED',
        },
      });
    });
  }
  async map(userId: string, id: string, input: unknown) {
    const data = parseInput(
      z.object({ accountId: z.string().min(1) }).strict(),
      input,
    );
    const account = await this.prisma.account.findFirst({
      where: { id: data.accountId, userId },
    });
    if (!account) throw new NotFoundException('Account not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SourceDocument" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const doc = await tx.sourceDocument.findFirst({
        where: { id, userId },
        include: { observations: true },
      });
      if (!doc) throw new NotFoundException('Document not found');
      if (doc.deletedAt) throw new BadRequestException('Source deleted');
      if (doc.observations.some((o) => o.transactionId))
        throw new ConflictException('Cannot remap posted evidence');
      if (
        doc.observations.some((o) => {
          const p = observationSchema.safeParse(o.parsed);
          return (
            p.success &&
            (p.data.sourceType === 'ICICI_BANK') !==
              (account.type === 'BANK_ACCOUNT')
          );
        })
      )
        throw new BadRequestException('Account type does not match source');
      await tx.sourceDocument.update({
        where: { id, userId },
        data: { accountId: account.id },
      });
    });
    return this.process(userId, id);
  }
  async password(userId: string, id: string, input: unknown) {
    const data = parseInput(
      z
        .object({
          password: z.string().min(1).max(256),
          remember: z.boolean().default(false),
        })
        .strict(),
      input,
    );
    const doc = await this.detail(userId, id);
    if (data.remember && !doc.accountId)
      throw new BadRequestException(
        'Map the account before remembering a password',
      );
    const result = await this.process(userId, id, data.password);
    if (
      data.remember &&
      result.status !== 'PASSWORD_REQUIRED' &&
      !result.errorCode &&
      doc.accountId
    ) {
      await this.prisma.account.update({
        where: { id: doc.accountId, userId },
        data: { statementPassword: this.crypto.encrypt(data.password) },
      });
    }
    return result;
  }
  async remove(userId: string, id: string) {
    const doc = await this.detail(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.sourceDocument.update({
        where: { id, userId },
        data: {
          metadata: {},
          fileName: 'Deleted source',
          deletedAt: new Date(),
          status: 'DELETED',
          errorCode: null,
        },
      });
      await this.storage.remove(tx, id);
      await tx.sourceObservation.updateMany({
        where: { userId, documentId: id },
        data: { parsed: {}, rawRow: {}, status: 'SOURCE_DELETED' },
      });
      if (doc.accountId)
        await tx.account.update({
          where: { id: doc.accountId, userId },
          data: { statementPassword: null },
        });
    });
    return { deleted: true };
  }
  async process(userId: string, id: string, password?: string) {
    const doc = await this.prisma.sourceDocument.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!doc?.encryptedBytes) throw new NotFoundException('Source unavailable');
    let result;
    try {
      const bytes = this.storage.load(doc.encryptedBytes);
      const account = doc.accountId
        ? await this.prisma.account.findFirst({
            where: { id: doc.accountId, userId },
          })
        : null;
      const remembered =
        !password && account?.statementPassword
          ? this.crypto.decrypt(account.statementPassword).toString()
          : undefined;
      result =
        doc.kind === 'UPLOAD'
          ? this.parseUpload(bytes, doc.fileName, doc.metadata)
          : doc.kind === 'STATEMENT'
            ? parseStatementText(await readPdf(bytes, password ?? remembered))
            : parseAlert(
                (JSON.parse(bytes.toString()) as { text: string }).text,
              );
    } catch (error) {
      const code =
        error instanceof Error &&
        [
          'PASSWORD_REQUIRED',
          'PDF_TIMEOUT',
          'TOO_MANY_PAGES',
          'PDF_PARSE_FAILED',
        ].includes(error.message)
          ? error.message
          : 'PARSE_FAILED';
      await this.prisma.sourceDocument.updateMany({
        where: { id, userId, deletedAt: null },
        data: {
          status: code === 'PASSWORD_REQUIRED' ? code : 'FAILED',
          errorCode: code,
        },
      });
      return this.detail(userId, id);
    }
    const validated =
      doc.kind === 'UPLOAD' ||
      (this.config.get<string>('EXPENSE_VALIDATED_TEMPLATES') ?? '')
        .split(',')
        .includes(result.version);
    if (!doc.accountId && result.rows.length) {
      const first = result.rows[0];
      const mappings = first.identifier
        ? await this.prisma.accountIdentifier.findMany({
            where: {
              userId,
              value: first.identifier,
              sourceType: first.sourceType,
              AND: [
                {
                  OR: [
                    { validFrom: null },
                    { validFrom: { lte: new Date(first.transactionDate) } },
                  ],
                },
                {
                  OR: [
                    { validTo: null },
                    { validTo: { gte: new Date(first.transactionDate) } },
                  ],
                },
              ],
            },
          })
        : [];
      if (
        mappings.length === 1 &&
        result.rows.every(
          (r) =>
            r.identifier === first.identifier &&
            r.sourceType === first.sourceType &&
            (!mappings[0].validFrom ||
              new Date(r.transactionDate) >= mappings[0].validFrom) &&
            (!mappings[0].validTo ||
              new Date(r.transactionDate) <= mappings[0].validTo),
        )
      ) {
        doc.accountId = mappings[0].accountId;
        await this.prisma.sourceDocument.updateMany({
          where: { id, userId, deletedAt: null, accountId: null },
          data: { accountId: doc.accountId },
        });
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SourceDocument" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
      const current = await tx.sourceDocument.findFirst({
        where: { id, userId, deletedAt: null },
      });
      if (!current) return;
      await tx.sourceDocument.update({
        where: { id },
        data: {
          parserVersion: result.version,
          status: result.ignored
            ? 'IGNORED'
            : result.error
              ? 'UNSUPPORTED'
              : !current.accountId
                ? 'NEEDS_ACCOUNT'
                : validated
                  ? 'READY'
                  : 'NEEDS_TEMPLATE_REVIEW',
          errorCode: result.error ?? null,
          statementFrom: result.from ? new Date(result.from) : null,
          statementTo: result.to ? new Date(result.to) : null,
          coverageStatus: 'UNVERIFIED',
          metadata: {
            ...(current.metadata as Prisma.JsonObject),
            statementChecksPassed: !!result.reconciled && validated,
            extractedRows: result.rawRows,
          },
        },
      });
      for (let i = 0; i < result.rows.length; i++)
        await tx.sourceObservation.upsert({
          where: { documentId_rowKey: { documentId: id, rowKey: String(i) } },
          update: {},
          create: {
            documentId: id,
            userId,
            rowKey: String(i),
            parsed: json(result.rows[i]),
            rawRow: json({ normalized: result.rows[i] }),
            status: 'PENDING',
          },
        });
    });
    if (validated && doc.accountId) {
      const connection = doc.connectionId
        ? await this.prisma.emailConnection.findFirst({
            where: { id: doc.connectionId, userId },
          })
        : null;
      if (!connection || connection.status === 'ACTIVE')
        await this.post(userId, id, true);
    }
    return this.detail(userId, id);
  }
  private parseUpload(
    bytes: Buffer,
    fileName: string,
    metadata: Prisma.JsonValue,
  ) {
    const sourceType = (metadata as { sourceType?: string }).sourceType;
    const raw = readStatementFile(fileName, bytes);
    const result = (
      sourceType === 'ICICI_BANK'
        ? new IciciBankParser()
        : new IciciAmazonCardParser()
    ).parseRows(raw);
    return {
      version: 'legacy-table-v1',
      rows: result.rows.map((r) => ({
        transactionDate: r.transactionDate,
        descriptionRaw: r.descriptionRaw,
        descriptionClean: r.descriptionClean,
        balance: r.balance,
        paymentMethod: r.paymentMethod,
        merchantKey: merchantKey(r.descriptionClean),
        moneyIn: r.moneyIn,
        moneyOut: r.moneyOut,
        currency: 'INR' as const,
        sourceType: r.sourceType,
        referenceNumber: r.referenceNumber,
        identifier: null,
      })),
      rawRows: raw.map((r) => JSON.stringify(r)),
      error: result.stats.errors.length
        ? 'STATEMENT_ROW_ERRORS'
        : !result.rows.length
          ? 'NO_VALID_ROWS'
          : undefined,
      ignored: false,
      from: undefined as string | undefined,
      to: undefined as string | undefined,
      reconciled: false,
    };
  }
  async post(userId: string, id: string, automatic = false) {
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "SourceDocument" WHERE "id" = ${id} AND "userId" = ${userId} FOR UPDATE`;
        const doc = await tx.sourceDocument.findFirst({
          where: { id, userId, deletedAt: null },
          include: { observations: true },
        });
        if (
          automatic &&
          doc &&
          doc.kind !== 'UPLOAD' &&
          !(this.config.get<string>('EXPENSE_VALIDATED_TEMPLATES') ?? '')
            .split(',')
            .includes(doc.parserVersion ?? '')
        )
          return;
        if (automatic && doc?.connectionId) {
          await tx.$queryRaw`SELECT "id" FROM "EmailConnection" WHERE "id" = ${doc.connectionId} AND "userId" = ${userId} FOR UPDATE`;
          const connection = await tx.emailConnection.findFirst({
            where: { id: doc.connectionId, userId },
          });
          if (connection?.status !== 'ACTIVE') return;
        }
        if (!doc?.accountId || doc.errorCode || !doc.observations.length)
          throw new BadRequestException(
            'Map a successfully parsed document first',
          );
        await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${doc.accountId} AND "userId" = ${userId} FOR UPDATE`;
        const account = await tx.account.findFirstOrThrow({
          where: { id: doc.accountId, userId },
        });
        const rules = await tx.rule.findMany({
          where: { userId, isActive: true },
          orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
        });
        const aliases = await tx.merchantAlias.findMany({ where: { userId } });
        for (const observation of doc.observations) {
          if (observation.transactionId) continue;
          const row = observationSchema.parse(observation.parsed);
          row.merchantKey =
            aliases.find((a) => a.alias === row.merchantKey)?.canonical ??
            row.merchantKey;
          if (
            (row.sourceType === 'ICICI_BANK') !==
            (account.type === 'BANK_ACCOUNT')
          )
            throw new BadRequestException('Wrong account type');
          const sameEvidence = await tx.sourceObservation.findFirst({
            where: {
              userId,
              rowKey: observation.rowKey,
              transactionId: { not: null },
              document: {
                accountId: account.id,
                contentHash: doc.contentHash,
                id: { not: doc.id },
              },
            },
          });
          const outcome =
            sameEvidence?.transactionId ??
            (await this.match(tx, userId, account.id, doc.kind, doc.id, row));
          if (outcome === 'AMBIGUOUS') {
            await tx.sourceObservation.update({
              where: { id: observation.id },
              data: {
                status: 'NEEDS_MATCH',
                reason:
                  'Possible duplicate; select an existing transaction or confirm a separate purchase.',
              },
            });
            continue;
          }
          let transactionId = outcome;
          if (!transactionId) {
            const category = classify(
              {
                ...row,
                accountId: account.id,
                descriptionClean: row.descriptionClean ?? row.descriptionRaw,
              },
              rules,
            );
            const transaction = await tx.transaction.create({
              data: {
                userId,
                accountId: account.id,
                sourceType: row.sourceType,
                transactionDate: new Date(row.transactionDate),
                postingDate: row.postingDate ? new Date(row.postingDate) : null,
                descriptionRaw: row.descriptionRaw,
                descriptionClean: row.descriptionClean ?? row.descriptionRaw,
                merchantKey: row.merchantKey,
                moneyOut: row.moneyOut,
                moneyIn: row.moneyIn,
                netAmount: row.moneyIn - row.moneyOut,
                currency: row.currency,
                balance: row.balance,
                paymentMethod: row.paymentMethod,
                referenceNumber: row.referenceNumber,
                transactionHash: `observation:${observation.id}`,
                confirmation: doc.kind !== 'ALERT' ? 'POSTED' : 'UNCONFIRMED',
                reviewStatus:
                  account.reviewEverything || category.expenseType === 'REVIEW'
                    ? 'NEEDS_REVIEW'
                    : 'AUTO_ACCEPTED',
                reviewReason: account.reviewEverything
                  ? 'Account requires review'
                  : category.notes,
                category: { create: category },
              },
            });
            transactionId = transaction.id;
          } else if (doc.kind !== 'ALERT')
            await tx.transaction.update({
              where: { id: transactionId, userId },
              data: {
                confirmation: 'POSTED',
                referenceNumber: row.referenceNumber ?? undefined,
                postingDate: row.postingDate ? new Date(row.postingDate) : null,
              },
            });
          await tx.sourceObservation.update({
            where: { id: observation.id },
            data: { transactionId, status: 'POSTED', reason: null },
          });
          await this.linkTransfer(tx, userId, transactionId);
          await this.linkReversal(tx, userId, transactionId);
        }
        const unresolved = await tx.sourceObservation.count({
          where: { documentId: id, transactionId: null },
        });
        await tx.sourceDocument.update({
          where: { id },
          data: {
            status: unresolved ? 'NEEDS_MATCH' : 'POSTED',
            coverageStatus:
              !unresolved &&
              (doc.metadata as Prisma.JsonObject).statementChecksPassed === true
                ? 'RECONCILED'
                : 'UNVERIFIED',
          },
        });
      },
      { timeout: 30000 },
    );
    return this.detail(userId, id);
  }
  private async match(
    tx: Prisma.TransactionClient,
    userId: string,
    accountId: string,
    kind: string,
    documentId: string,
    row: Observation,
  ): Promise<string | null> {
    const date = new Date(row.transactionDate).getTime();
    const include = {
      observations: {
        select: {
          documentId: true,
          document: { select: { kind: true, contentHash: true } },
        },
      },
    };
    let candidates = row.referenceNumber
      ? await tx.transaction.findMany({
          where: {
            userId,
            accountId,
            currency: row.currency,
            referenceNumber: row.referenceNumber,
            ...(row.moneyOut > 0
              ? { moneyOut: { gt: 0 } }
              : { moneyIn: { gt: 0 } }),
          },
          include,
          take: 3,
        })
      : [];
    if (!candidates.length) {
      const nearby = await tx.transaction.findMany({
        where: {
          userId,
          accountId,
          currency: row.currency,
          moneyOut: row.moneyOut,
          moneyIn: row.moneyIn,
          ...(row.referenceNumber ? { referenceNumber: null } : {}),
          transactionDate: {
            gte: new Date(date - 3 * 86400000),
            lte: new Date(date + 3 * 86400000),
          },
        },
        include,
        take: 100,
      });
      if (nearby.length === 100) return 'AMBIGUOUS';
      candidates = nearby.filter(
        (c) =>
          (c.merchantKey ?? merchantKey(c.descriptionClean)) ===
          row.merchantKey,
      );
    }
    if (!candidates.length) return null;
    if (candidates.length !== 1) return 'AMBIGUOUS';
    const candidate = candidates[0];
    if (
      Number(candidate.moneyIn) !== row.moneyIn ||
      Number(candidate.moneyOut) !== row.moneyOut
    )
      return 'AMBIGUOUS';
    if (candidate.observations.some((o) => o.documentId === documentId))
      return row.referenceNumber ? 'AMBIGUOUS' : null;
    if (
      !row.referenceNumber &&
      candidate.observations.some((o) => o.document.kind === kind)
    )
      return 'AMBIGUOUS';
    return candidate.id;
  }
  private async linkReversal(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.transaction.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (
      !row ||
      row.category?.expenseType !== 'REFUND' ||
      !row.referenceNumber ||
      row.moneyIn.lte(0)
    )
      return;
    const matches = await tx.transaction.findMany({
      where: {
        userId,
        accountId: row.accountId,
        referenceNumber: row.referenceNumber,
        currency: row.currency,
        moneyOut: row.moneyIn,
        moneyIn: 0,
        category: { expenseType: 'EXPENSE' },
        id: { not: id },
      },
      take: 2,
    });
    if (matches.length === 1)
      await tx.transaction.update({
        where: { id },
        data: { reversalOfId: matches[0].id },
      });
  }
  private async linkTransfer(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const row = await tx.transaction.findFirst({
      where: { id, userId },
      include: { category: true },
    });
    if (!row || row.category?.expenseType !== 'TRANSFER' || row.transferPairId)
      return;
    const matches = await tx.transaction.findMany({
      where: {
        userId,
        accountId: { not: row.accountId },
        currency: row.currency,
        moneyIn: row.moneyOut,
        moneyOut: row.moneyIn,
        transferPairId: null,
        category: { expenseType: 'TRANSFER' },
        transactionDate: {
          gte: new Date(row.transactionDate.getTime() - 3 * 86400000),
          lte: new Date(row.transactionDate.getTime() + 3 * 86400000),
        },
      },
      take: 2,
    });
    if (matches.length === 1) {
      // Pair only with shared reference; equal amounts alone do not establish account ownership.
      if (
        !row.referenceNumber ||
        row.referenceNumber !== matches[0].referenceNumber
      )
        return;
      await tx.transaction.update({
        where: { id },
        data: { transferPairId: matches[0].id },
      });
      await tx.transaction.update({
        where: { id: matches[0].id },
        data: { transferPairId: id },
      });
    }
  }
  async resolve(
    userId: string,
    documentId: string,
    observationId: string,
    input: unknown,
  ) {
    const data = parseInput(
      z
        .object({
          transactionId: z.string().optional(),
          separate: z.boolean().default(false),
        })
        .refine(
          (x) => Boolean(x.transactionId) !== x.separate,
          'Choose existing or separate',
        ),
      input,
    );
    const doc = await this.detail(userId, documentId);
    const observation = doc.observations.find(
      (o) => o.id === observationId && o.status === 'NEEDS_MATCH',
    );
    if (!observation || !doc.accountId || doc.deletedAt)
      throw new NotFoundException('Unresolved observation not found');
    const row = observationSchema.parse(observation.parsed);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "SourceDocument" WHERE "id" = ${documentId} FOR UPDATE`;
      const mapped = await tx.sourceDocument.findFirst({
        where: { id: documentId, userId, deletedAt: null },
      });
      if (!mapped || mapped.accountId !== doc.accountId)
        throw new ConflictException('Account mapping changed');
      await tx.$queryRaw`SELECT "id" FROM "Account" WHERE "id" = ${doc.accountId} AND "userId" = ${userId} FOR UPDATE`;
      const current = await tx.sourceObservation.findFirst({
        where: {
          id: observationId,
          userId,
          transactionId: null,
          document: { deletedAt: null },
        },
      });
      if (!current) throw new ConflictException('Observation changed');
      let id = data.transactionId;
      if (id) {
        const target = await tx.transaction.findFirst({
          where: {
            id,
            userId,
            accountId: doc.accountId!,
            currency: row.currency,
            moneyIn: row.moneyIn,
            moneyOut: row.moneyOut,
          },
        });
        if (!target)
          throw new BadRequestException(
            'Target must match account, amount, currency and direction',
          );
        if (doc.kind !== 'ALERT')
          await tx.transaction.update({
            where: { id },
            data: {
              confirmation: 'POSTED',
              postingDate: row.postingDate ? new Date(row.postingDate) : null,
            },
          });
      } else {
        const rules = await tx.rule.findMany({
          where: { userId, isActive: true },
          orderBy: { priority: 'asc' },
        });
        const category = classify(
          {
            ...row,
            accountId: doc.accountId!,
            descriptionClean: row.descriptionClean ?? row.descriptionRaw,
          },
          rules,
        );
        id = (
          await tx.transaction.create({
            data: {
              userId,
              accountId: doc.accountId!,
              sourceType: row.sourceType,
              transactionDate: new Date(row.transactionDate),
              postingDate: row.postingDate ? new Date(row.postingDate) : null,
              currency: row.currency,
              balance: row.balance,
              paymentMethod: row.paymentMethod,
              descriptionRaw: row.descriptionRaw,
              descriptionClean: row.descriptionClean ?? row.descriptionRaw,
              merchantKey: row.merchantKey,
              moneyIn: row.moneyIn,
              moneyOut: row.moneyOut,
              netAmount: row.moneyIn - row.moneyOut,
              referenceNumber: row.referenceNumber,
              transactionHash: `observation:${observation.id}`,
              confirmation: doc.kind !== 'ALERT' ? 'POSTED' : 'UNCONFIRMED',
              reviewStatus: 'NEEDS_REVIEW',
              category: { create: category },
            },
          })
        ).id;
      }
      await tx.sourceObservation.update({
        where: { id: observationId },
        data: {
          transactionId: id,
          status: 'POSTED',
          reason: 'User resolved match',
        },
      });
      await this.linkTransfer(tx, userId, id);
      await this.linkReversal(tx, userId, id);
      if (
        !(await tx.sourceObservation.count({
          where: { documentId, transactionId: null },
        }))
      )
        await tx.sourceDocument.update({
          where: { id: documentId },
          data: {
            status: 'POSTED',
            coverageStatus:
              (doc.metadata as Prisma.JsonObject).statementChecksPassed === true
                ? 'RECONCILED'
                : 'UNVERIFIED',
          },
        });
    });
    return this.detail(userId, documentId);
  }
}
