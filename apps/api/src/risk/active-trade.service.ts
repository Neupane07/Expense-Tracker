import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type DecimalLike = { toNumber(): number };

type BrokerPositionRow = {
  tradingSymbol: string;
  productType: string | null;
  netQty: number;
};

type JournalActiveRow = {
  id: string;
  symbol: string;
  side: string;
  product: string;
  plannedEntry: DecimalLike;
  plannedStopLoss: DecimalLike;
  quantity: number;
  createdAt: Date;
};

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
        orderBy: [{ symbol: 'asc' }, { createdAt: 'asc' }],
      }),
      this.findLatestPositions(userId),
    ]);

    const deliveryPositions = positions
      .map((position) => ({
        tradingSymbol: position.tradingSymbol.toUpperCase(),
        productType: position.productType,
        netQty: this.decimalToNumber(position.netQty),
      }))
      .filter(
        (position) =>
          position.netQty !== 0 && isDeliveryProduct(position.productType),
      );

    const journalBySymbol = groupJournalBySymbol(journalActive);
    const usedPositionKeys = new Set<string>();
    const trades: ReconciledActiveTrade[] = [];
    const warnings: string[] = [];
    let activeSwingCapital = 0;
    let maxLossIfActiveStopLossesHit = 0;
    let confirmedCount = 0;

    for (const [symbol, entries] of journalBySymbol.entries()) {
      if (entries.length > 1) {
        warnings.push('DUPLICATE_ACTIVE_JOURNAL_FOR_SYMBOL');
      }

      const symbolPositions = deliveryPositions.filter(
        (position) => position.tradingSymbol === symbol,
      );
      let symbolConfirmed = false;

      for (const entry of entries) {
        const reconciliation = this.reconcileJournalEntry(
          entry,
          symbolPositions,
          usedPositionKeys,
          symbolConfirmed,
        );

        if (reconciliation.classification === 'confirmed') {
          symbolConfirmed = true;
          confirmedCount += 1;
          if (reconciliation.maxLossIfStopHit != null) {
            maxLossIfActiveStopLossesHit += reconciliation.maxLossIfStopHit;
          }
        }

        activeSwingCapital += roundMoney(
          reconciliation.plannedEntry != null
            ? reconciliation.plannedEntry * (reconciliation.quantity ?? 0)
            : 0,
        );
        trades.push(reconciliation);
      }
    }

    const matchedJournalSymbols = new Set(journalBySymbol.keys());
    const inferredBrokerPositions = deliveryPositions
      .filter((position) => {
        const key = positionKey(position);
        return (
          !usedPositionKeys.has(key) &&
          !matchedJournalSymbols.has(position.tradingSymbol) &&
          position.netQty > 0
        );
      })
      .map((position) => ({
        symbol: position.tradingSymbol,
        quantity: position.netQty,
      }));

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

    return {
      trades,
      confirmedCount,
      activeSwingTradeCount: journalActive.length,
      activeSwingCapital: roundMoney(activeSwingCapital),
      maxLossIfActiveStopLossesHit: roundMoney(maxLossIfActiveStopLossesHit),
      inferredBrokerPositions,
      unmatchedJournalEntries,
      warnings: [...new Set(warnings)],
    };
  }

  private reconcileJournalEntry(
    entry: JournalActiveRow,
    symbolPositions: BrokerPositionRow[],
    usedPositionKeys: Set<string>,
    symbolAlreadyConfirmed: boolean,
  ): ReconciledActiveTrade {
    const symbol = entry.symbol.toUpperCase();
    const plannedEntry = this.decimalToNumber(entry.plannedEntry);
    const plannedStopLoss = this.decimalToNumber(entry.plannedStopLoss);
    const quantity = entry.quantity;
    const tradeWarnings: string[] = [];
    const side = entry.side.trim().toUpperCase();
    const product = entry.product.trim().toUpperCase();
    const hasValidStopGeometry =
      plannedEntry > 0 && plannedStopLoss > 0 && plannedStopLoss < plannedEntry;
    const maxLossIfStopHit = hasValidStopGeometry
      ? roundMoney((plannedEntry - plannedStopLoss) * quantity)
      : null;

    if (symbolAlreadyConfirmed) {
      return this.buildTrade({
        symbol,
        journalEntryId: entry.id,
        classification: 'incomplete',
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty: null,
        warnings: ['DUPLICATE_ACTIVE_JOURNAL_ENTRY'],
      });
    }

    if (product !== 'DELIVERY') {
      return this.buildTrade({
        symbol,
        journalEntryId: entry.id,
        classification: 'incomplete',
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty: null,
        warnings: ['ACTIVE_JOURNAL_PRODUCT_NOT_DELIVERY'],
      });
    }

    if (!hasValidStopGeometry) {
      return this.buildTrade({
        symbol,
        journalEntryId: entry.id,
        classification: 'incomplete',
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty: null,
        warnings: ['ACTIVE_TRADE_STOP_LOSS_PLAN_INCOMPLETE'],
      });
    }

    const matchingPositions = symbolPositions.filter((position) =>
      positionMatchesJournalSide(position, side),
    );

    if (matchingPositions.length === 0) {
      const incompatiblePosition = symbolPositions[0];
      const brokerPositionQty = incompatiblePosition?.netQty ?? null;

      return this.buildTrade({
        symbol,
        journalEntryId: entry.id,
        classification: incompatiblePosition ? 'incomplete' : 'unmatched',
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty,
        warnings: incompatiblePosition
          ? ['BROKER_POSITION_PRODUCT_OR_SIDE_MISMATCH']
          : ['ACTIVE_JOURNAL_WITHOUT_BROKER_POSITION'],
      });
    }

    const exactMatch = matchingPositions.find(
      (position) =>
        !usedPositionKeys.has(positionKey(position)) &&
        Math.abs(position.netQty) === quantity,
    );

    if (exactMatch) {
      usedPositionKeys.add(positionKey(exactMatch));
      return this.buildTrade({
        symbol,
        journalEntryId: entry.id,
        classification: 'confirmed',
        quantity,
        plannedEntry,
        plannedStopLoss,
        maxLossIfStopHit,
        brokerPositionQty: exactMatch.netQty,
        warnings: tradeWarnings,
      });
    }

    const availableMatch = matchingPositions.find(
      (position) => !usedPositionKeys.has(positionKey(position)),
    );

    return this.buildTrade({
      symbol,
      journalEntryId: entry.id,
      classification: 'incomplete',
      quantity,
      plannedEntry,
      plannedStopLoss,
      maxLossIfStopHit,
      brokerPositionQty:
        availableMatch?.netQty ?? matchingPositions[0]?.netQty ?? null,
      warnings: ['ACTIVE_TRADE_QUANTITY_MISMATCH'],
    });
  }

  private buildTrade(input: {
    symbol: string;
    journalEntryId: string;
    classification: ActiveTradeClassification;
    quantity: number;
    plannedEntry: number;
    plannedStopLoss: number;
    maxLossIfStopHit: number | null;
    brokerPositionQty: number | null;
    warnings: string[];
  }): ReconciledActiveTrade {
    return {
      symbol: input.symbol,
      journalEntryId: input.journalEntryId,
      classification: input.classification,
      quantity: input.quantity,
      plannedEntry: input.plannedEntry,
      plannedStopLoss: input.plannedStopLoss,
      maxLossIfStopHit: input.maxLossIfStopHit,
      brokerPositionQty: input.brokerPositionQty,
      warnings: input.warnings,
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

function groupJournalBySymbol(entries: JournalActiveRow[]) {
  const grouped = new Map<string, JournalActiveRow[]>();

  for (const entry of entries) {
    const symbol = entry.symbol.toUpperCase();
    const rows = grouped.get(symbol) ?? [];
    rows.push(entry);
    grouped.set(symbol, rows);
  }

  return grouped;
}

function isDeliveryProduct(productType: string | null | undefined) {
  const normalized = (productType ?? '').trim().toUpperCase();

  return (
    normalized === 'CNC' ||
    normalized === 'DELIVERY' ||
    normalized.includes('CNC')
  );
}

function positionMatchesJournalSide(
  position: BrokerPositionRow,
  journalSide: string,
) {
  if (journalSide === 'BUY') {
    return position.netQty > 0;
  }

  if (journalSide === 'SELL') {
    return position.netQty < 0;
  }

  return false;
}

function positionKey(position: BrokerPositionRow) {
  return `${position.tradingSymbol}:${position.productType ?? 'UNKNOWN'}:${position.netQty}`;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
