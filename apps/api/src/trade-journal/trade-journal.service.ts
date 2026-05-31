import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma, TradeJournalEntry } from '../generated/prisma/client';
import { InstrumentsService } from '../market-data/instruments.service';
import { PrismaService } from '../prisma/prisma.service';
import type { TradeValidationResult } from '../risk/trade-validation.service';
import { TradeValidationService } from '../risk/trade-validation.service';
import type { SwingCandidate } from '../scanner/swing-scanner.service';
import type {
  CreateEntryInput,
  FromScannerCandidateInput,
  ListEntriesQuery,
  UpdateEntryInput,
} from './trade-journal.dto';

const JOURNAL_DISCLAIMER =
  'Journal only — does not place orders. Verify and execute manually in Dhan.';

type DecimalLike = { toNumber(): number };

export type ValidationSnapshot = {
  valid: boolean;
  warnings: string[];
  rejectReasons: string[];
  validatedAt: string;
  riskReward: number | null;
  capitalRequired: number | null;
  maxLossAmount: number | null;
};

@Injectable()
export class TradeJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly instruments: InstrumentsService,
    private readonly tradeValidation: TradeValidationService,
  ) {}

  getStatus() {
    return {
      module: 'trade-journal',
      status: 'active',
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async listEntries(userId: string, query: ListEntriesQuery) {
    const where: Prisma.TradeJournalEntryWhereInput = { userId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.symbol) {
      where.symbol = query.symbol.trim().toUpperCase();
    }

    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) {
        where.createdAt.gte = new Date(query.dateFrom);
      }
      if (query.dateTo) {
        where.createdAt.lte = new Date(query.dateTo);
      }
    }

    const entries = await this.prisma.tradeJournalEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
    });

    return {
      entries: entries.map((entry) => this.serialize(entry)),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async getEntry(userId: string, entryId: string) {
    const entry = await this.findOwnedEntry(userId, entryId);

    return {
      entry: this.serialize(entry),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async createEntry(userId: string, input: CreateEntryInput) {
    const symbol = await this.assertVerifiedSymbol(userId, input.symbol);
    this.assertDeliveryOnly(input.product);

    const plannedEntry = input.plannedEntry;
    const plannedTarget = input.plannedTarget;
    const plannedStopLoss = input.plannedStopLoss;
    const quantity = input.quantity;
    const validation = await this.runValidation(userId, {
      symbol: symbol.symbol,
      entry: plannedEntry,
      target: plannedTarget,
      stopLoss: plannedStopLoss,
      quantity,
    });

    const entry = await this.prisma.tradeJournalEntry.create({
      data: {
        userId,
        symbol: symbol.symbol,
        side: input.side.trim().toUpperCase(),
        product: 'DELIVERY',
        plannedEntry,
        plannedTarget,
        plannedStopLoss,
        quantity,
        setupType: input.setupType ?? null,
        notes: input.notes ?? null,
        status: input.status ?? 'PLANNED',
        source: 'MANUAL',
        validationSnapshot: validation.snapshot,
        dataQuality: validation.dataQuality,
      },
    });

    return {
      entry: this.serialize(entry),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async createFromScannerCandidate(
    userId: string,
    input: FromScannerCandidateInput,
  ) {
    const symbol = input.symbol.trim().toUpperCase();
    const setupType = input.setupType.trim().toUpperCase();
    const candidate = await this.resolveScannerCandidate(
      userId,
      symbol,
      setupType,
      input.swingScanRunId,
    );
    await this.assertVerifiedSymbol(userId, symbol);

    const quantity = input.quantity ?? candidate.suggestedQuantity;
    const validation = await this.runValidation(userId, {
      symbol,
      entry: candidate.entry,
      target: candidate.target,
      stopLoss: candidate.stopLoss,
      quantity,
    });

    const entry = await this.prisma.tradeJournalEntry.create({
      data: {
        userId,
        symbol,
        side: 'BUY',
        product: 'DELIVERY',
        plannedEntry: candidate.entry,
        plannedTarget: candidate.target,
        plannedStopLoss: candidate.stopLoss,
        quantity,
        setupType,
        notes: input.notes ?? null,
        status: 'PLANNED',
        source: 'FROM_SCANNER',
        swingScanRunId: candidate.runId,
        scannerCandidateKey: `${symbol}::${setupType}`,
        validationSnapshot: validation.snapshot,
        dataQuality: {
          ...(validation.dataQuality as object),
          scannerStatus: candidate.status,
        },
      },
    });

    return {
      entry: this.serialize(entry),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async updateEntry(userId: string, entryId: string, input: UpdateEntryInput) {
    const existing = await this.findOwnedEntry(userId, entryId);

    if (input.status === 'CANCELLED') {
      if (existing.status === 'CLOSED') {
        throw new BadRequestException('Closed entries cannot be cancelled.');
      }

      const entry = await this.prisma.tradeJournalEntry.update({
        where: { id: entryId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });

      return {
        entry: this.serialize(entry),
        disclaimer: JOURNAL_DISCLAIMER,
      };
    }

    const isClosing =
      input.status === 'CLOSED' ||
      input.exitPrice !== undefined ||
      input.exitAt !== undefined;

    if (isClosing) {
      return this.closeEntry(userId, existing, input);
    }

    if (existing.status !== 'PLANNED' && existing.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only planned or active entries can be updated.',
      );
    }

    if (existing.status !== 'PLANNED') {
      const hasPlanFieldChange =
        input.plannedEntry !== undefined ||
        input.plannedTarget !== undefined ||
        input.plannedStopLoss !== undefined ||
        input.quantity !== undefined ||
        input.setupType !== undefined;

      if (hasPlanFieldChange) {
        throw new BadRequestException(
          'Planned levels can only be edited while status is PLANNED.',
        );
      }
    }

    const nextStatus = input.status;
    if (nextStatus === 'CLOSED') {
      return this.closeEntry(userId, existing, input);
    }

    const plannedEntry =
      input.plannedEntry ?? this.decimalToNumber(existing.plannedEntry);
    const plannedTarget =
      input.plannedTarget ?? this.decimalToNumber(existing.plannedTarget);
    const plannedStopLoss =
      input.plannedStopLoss ?? this.decimalToNumber(existing.plannedStopLoss);
    const quantity = input.quantity ?? existing.quantity;

    const entry = await this.prisma.tradeJournalEntry.update({
      where: { id: entryId },
      data: {
        plannedEntry,
        plannedTarget,
        plannedStopLoss,
        quantity,
        setupType:
          input.setupType !== undefined ? input.setupType : existing.setupType,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        status: nextStatus ?? existing.status,
        mistakeTags: input.mistakeTags ?? existing.mistakeTags,
        lessonLearned:
          input.lessonLearned !== undefined
            ? input.lessonLearned
            : existing.lessonLearned,
      },
    });

    return {
      entry: this.serialize(entry),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  async deleteEntry(userId: string, entryId: string) {
    const existing = await this.findOwnedEntry(userId, entryId);

    if (existing.status !== 'PLANNED' && existing.status !== 'CANCELLED') {
      throw new BadRequestException(
        'Only planned or cancelled entries can be deleted.',
      );
    }

    await this.prisma.tradeJournalEntry.delete({ where: { id: entryId } });

    return { deleted: true, disclaimer: JOURNAL_DISCLAIMER };
  }

  private async closeEntry(
    _userId: string,
    existing: TradeJournalEntry,
    input: UpdateEntryInput,
  ) {
    if (existing.status === 'CLOSED') {
      throw new BadRequestException('Entry is already closed.');
    }

    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled entries cannot be closed.');
    }

    const exitPrice = input.exitPrice;
    if (exitPrice === undefined || exitPrice <= 0) {
      throw new BadRequestException(
        'exitPrice is required to close a trade journal entry.',
      );
    }

    const exitAt = input.exitAt ? new Date(input.exitAt) : new Date();
    const entryPrice = this.decimalToNumber(existing.plannedEntry);
    const actualPnl = roundMoney((exitPrice - entryPrice) * existing.quantity);

    const entry = await this.prisma.tradeJournalEntry.update({
      where: { id: existing.id },
      data: {
        status: 'CLOSED',
        exitPrice,
        exitAt,
        actualPnl,
        exitReason: input.exitReason ?? null,
        mistakeTags: input.mistakeTags ?? existing.mistakeTags,
        lessonLearned:
          input.lessonLearned !== undefined
            ? input.lessonLearned
            : existing.lessonLearned,
        closedAt: new Date(),
      },
    });

    return {
      entry: this.serialize(entry),
      disclaimer: JOURNAL_DISCLAIMER,
    };
  }

  private async resolveScannerCandidate(
    userId: string,
    symbol: string,
    setupType: string,
    swingScanRunId?: string,
  ): Promise<SwingCandidate & { runId: string }> {
    const run = swingScanRunId
      ? await this.prisma.swingScanRun.findFirst({
          where: { id: swingScanRunId, userId },
        })
      : await this.prisma.swingScanRun.findFirst({
          where: { userId },
          orderBy: { runAt: 'desc' },
        });

    if (!run) {
      throw new NotFoundException('No swing scan run found for this user.');
    }

    const candidates = run.candidates as SwingCandidate[];
    const candidate = candidates.find(
      (item) =>
        item.symbol.toUpperCase() === symbol &&
        item.setupType.toUpperCase() === setupType,
    );

    if (!candidate) {
      throw new NotFoundException(
        `Scanner candidate ${symbol}::${setupType} was not found in scan run ${run.id}.`,
      );
    }

    return { ...candidate, runId: run.id };
  }

  private async assertVerifiedSymbol(userId: string, symbol: string) {
    try {
      const instrument = await this.instruments.findBySymbol(userId, symbol);
      return { symbol: instrument.symbol };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException({
          message: 'Symbol is not verified',
          code: 'SYMBOL_NOT_VERIFIED',
        });
      }

      throw error;
    }
  }

  private assertDeliveryOnly(product: string) {
    if (product.trim().toUpperCase() !== 'DELIVERY') {
      throw new BadRequestException({
        message: 'Only DELIVERY product is supported in trade journal v1',
        code: 'PRODUCT_NOT_DELIVERY',
      });
    }
  }

  private async runValidation(
    userId: string,
    input: {
      symbol: string;
      entry: number;
      target: number;
      stopLoss: number;
      quantity: number;
    },
  ) {
    const result = await this.tradeValidation.validateTrade(userId, {
      symbol: input.symbol,
      side: 'BUY',
      product: 'DELIVERY',
      entry: input.entry,
      target: input.target,
      stopLoss: input.stopLoss,
      quantity: input.quantity,
    });

    return {
      snapshot: this.buildValidationSnapshot(result),
      dataQuality: result.dataQuality,
    };
  }

  private buildValidationSnapshot(
    result: TradeValidationResult,
  ): ValidationSnapshot {
    return {
      valid: result.valid,
      warnings: result.warnings,
      rejectReasons: result.rejectReasons,
      validatedAt: new Date().toISOString(),
      riskReward: result.riskReward,
      capitalRequired: result.capitalRequired,
      maxLossAmount: result.maxLossAmount,
    };
  }

  private async findOwnedEntry(userId: string, entryId: string) {
    const entry = await this.prisma.tradeJournalEntry.findFirst({
      where: { id: entryId, userId },
    });

    if (!entry) {
      throw new NotFoundException('Trade journal entry not found.');
    }

    return entry;
  }

  private serialize(entry: TradeJournalEntry) {
    return {
      id: entry.id,
      symbol: entry.symbol,
      side: entry.side,
      product: entry.product,
      plannedEntry: this.decimalToNumber(entry.plannedEntry),
      plannedTarget: this.decimalToNumber(entry.plannedTarget),
      plannedStopLoss: this.decimalToNumber(entry.plannedStopLoss),
      quantity: entry.quantity,
      setupType: entry.setupType,
      status: entry.status,
      notes: entry.notes,
      source: entry.source,
      swingScanRunId: entry.swingScanRunId,
      scannerCandidateKey: entry.scannerCandidateKey,
      validationSnapshot: entry.validationSnapshot,
      dataQuality: entry.dataQuality,
      exitPrice: entry.exitPrice ? this.decimalToNumber(entry.exitPrice) : null,
      exitAt: entry.exitAt?.toISOString() ?? null,
      actualPnl: entry.actualPnl ? this.decimalToNumber(entry.actualPnl) : null,
      exitReason: entry.exitReason,
      mistakeTags: entry.mistakeTags,
      lessonLearned: entry.lessonLearned,
      closedAt: entry.closedAt?.toISOString() ?? null,
      cancelledAt: entry.cancelledAt?.toISOString() ?? null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }

  private decimalToNumber(value: DecimalLike) {
    return value.toNumber();
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
