import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = { toNumber(): number };

export type ActiveTradeClassification =
  | 'confirmed'
  | 'inferred'
  | 'unmatched'
  | 'incomplete';

export type ReconciledActiveTrade = {
  symbol: string;
  journalEntryId: string | null;
  classification: ActiveTradeClassification;
  quantity: number | null;
  plannedEntry: number | null;
  plannedStopLoss: number | null;
  maxLossIfStopHit: number | null;
  brokerPositionQty: number | null;
  warnings: string[];
};

export type ActiveTradeReconciliation = {
  trades: ReconciledActiveTrade[];
  confirmedCount: number;
  activeSwingTradeCount: number;
  activeSwingCapital: number;
  maxLossIfActiveStopLossesHit: number;
  inferredBrokerPositions: Array<{ symbol: string; quantity: number }>;
  unmatchedJournalEntries: Array<{ id: string; symbol: string }>;
  warnings: string[];
};

@Injectable()
export class ActiveTradeService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcile(userId: string): Promise<ActiveTradeReconciliation> {
    const [journalActive, positions] = await Promise.all([
      this.prisma.tradeJournalEntry.findMany({
        where: { userId, status: 'ACTIVE' },
        orderBy: { symbol: 'asc' },
      }),
      this.findLatestPositions(userId),
    ]);

    const positionBySymbol = new Map(
      positions
        .filter((position) => this.decimalToNumber(position.netQty) !== 0)
        .map((position) => [
          position.tradingSymbol.toUpperCase(),
          this.decimalToNumber(position.netQty),
        ]),
    );
    const journalSymbols = new Set(
      journalActive.map((entry) => entry.symbol.toUpperCase()),
    );

    const trades: ReconciledActiveTrade[] = [];
    const warnings: string[] = [];
    let activeSwingCapital = 0;
    let maxLossIfActiveStopLossesHit = 0;

    for (const entry of journalActive) {
      const symbol = entry.symbol.toUpperCase();
      const brokerPositionQty = positionBySymbol.get(symbol) ?? null;
      const plannedEntry = this.decimalToNumber(entry.plannedEntry);
      const plannedStopLoss = this.decimalToNumber(entry.plannedStopLoss);
      const quantity = entry.quantity;
      const hasValidStopGeometry =
        plannedEntry > 0 &&
        plannedStopLoss > 0 &&
        plannedStopLoss < plannedEntry;
      const maxLossIfStopHit = hasValidStopGeometry
        ? roundMoney((plannedEntry - plannedStopLoss) * quantity)
        : null;

      let classification: ActiveTradeClassification;
      const tradeWarnings: string[] = [];

      if (!hasValidStopGeometry) {
        classification = 'incomplete';
        tradeWarnings.push('ACTIVE_TRADE_STOP_LOSS_PLAN_INCOMPLETE');
      } else if (brokerPositionQty != null && brokerPositionQty !== 0) {
        classification = 'confirmed';
      } else {
        classification = 'unmatched';
        tradeWarnings.push('ACTIVE_JOURNAL_WITHOUT_BROKER_POSITION');
      }

      activeSwingCapital += roundMoney(plannedEntry * quantity);

      if (classification === 'confirmed' && maxLossIfStopHit != null) {
        maxLossIfActiveStopLossesHit += maxLossIfStopHit;
      }

      trades.push({
        symbol,
        journalEntryId: entry.id,
        classification,
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty,
        warnings: tradeWarnings,
      });
    }

    const inferredBrokerPositions = [...positionBySymbol.entries()]
      .filter(([symbol]) => !journalSymbols.has(symbol))
      .map(([symbol, quantity]) => ({ symbol, quantity }));

    const unmatchedJournalEntries = trades
      .filter((trade) => trade.classification === 'unmatched')
      .map((trade) => ({
        id: trade.journalEntryId as string,
        symbol: trade.symbol,
      }));

    if (inferredBrokerPositions.length > 0) {
      warnings.push('BROKER_POSITIONS_NOT_CONFIRMED_AS_ACTIVE_SWINGS');
    }

    if (unmatchedJournalEntries.length > 0) {
      warnings.push('ACTIVE_JOURNAL_ENTRIES_WITHOUT_BROKER_CONFIRMATION');
    }

    if (trades.some((trade) => trade.classification === 'incomplete')) {
      warnings.push('ACTIVE_TRADE_STOP_LOSS_CONTEXT_INCOMPLETE');
    }

    const confirmedCount = trades.filter(
      (trade) => trade.classification === 'confirmed',
    ).length;

    return {
      trades,
      confirmedCount,
      activeSwingTradeCount: journalActive.length,
      activeSwingCapital: roundMoney(activeSwingCapital),
      maxLossIfActiveStopLossesHit: roundMoney(maxLossIfActiveStopLossesHit),
      inferredBrokerPositions,
      unmatchedJournalEntries,
      warnings,
    };
  }

  private async findLatestPositions(userId: string) {
    const latest = await this.prisma.brokerPositionSnapshot.aggregate({
      where: { userId },
      _max: { asOf: true },
    });

    if (!latest._max.asOf) {
      return [];
    }

    return this.prisma.brokerPositionSnapshot.findMany({
      where: { userId, asOf: latest._max.asOf },
      orderBy: { tradingSymbol: 'asc' },
    });
  }

  private decimalToNumber(value: DecimalLike | number | null | undefined) {
    if (typeof value === 'number') {
      return value;
    }

    return value?.toNumber() ?? 0;
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
