import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySymbol(userId: string, symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const existing = await this.prisma.instrument.findFirst({
      where: {
        symbol: normalizedSymbol,
        isActive: true,
      },
      orderBy: { lastVerifiedAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    const holdingMapping = await this.findHoldingMapping(
      userId,
      normalizedSymbol,
    );
    if (holdingMapping) {
      return this.upsertFromBrokerMapping(normalizedSymbol, holdingMapping);
    }

    const brokerMapping = await this.findBrokerRecordMapping(
      userId,
      normalizedSymbol,
    );
    if (brokerMapping) {
      return this.upsertFromBrokerMapping(normalizedSymbol, brokerMapping);
    }

    throw new NotFoundException(
      `Instrument ${normalizedSymbol} is not mapped yet.`,
    );
  }

  private async findHoldingMapping(userId: string, normalizedSymbol: string) {
    const latestHolding = await this.prisma.brokerHoldingSnapshot.findFirst({
      where: {
        userId,
        tradingSymbol: {
          equals: normalizedSymbol,
          mode: 'insensitive',
        },
      },
      orderBy: { asOf: 'desc' },
    });

    if (!latestHolding?.securityId) {
      return null;
    }

    return {
      exchange: latestHolding.exchange ?? 'NSE',
      securityId: latestHolding.securityId,
      isin: latestHolding.isin,
      instrumentType: latestHolding.assetClass === 'ETF' ? 'ETF' : 'EQUITY',
      source: 'DHAN_HOLDINGS',
      lastVerifiedAt: latestHolding.asOf,
    };
  }

  private async findBrokerRecordMapping(
    userId: string,
    normalizedSymbol: string,
  ) {
    const order = await this.prisma.brokerOrderSnapshot.findFirst({
      where: {
        userId,
        tradingSymbol: {
          equals: normalizedSymbol,
          mode: 'insensitive',
        },
        securityId: { not: null },
      },
      orderBy: { asOf: 'desc' },
    });

    if (order?.securityId) {
      return {
        exchange: exchangeFromSegment(order.exchangeSegment),
        securityId: order.securityId,
        isin: null,
        instrumentType: 'EQUITY',
        source: 'DHAN_ORDERS',
        lastVerifiedAt: order.asOf,
      };
    }

    const trade = await this.prisma.brokerTradeSnapshot.findFirst({
      where: {
        userId,
        tradingSymbol: {
          equals: normalizedSymbol,
          mode: 'insensitive',
        },
        securityId: { not: null },
      },
      orderBy: { asOf: 'desc' },
    });

    if (!trade?.securityId) {
      return null;
    }

    return {
      exchange: exchangeFromSegment(trade.exchangeSegment),
      securityId: trade.securityId,
      isin: null,
      instrumentType: 'EQUITY',
      source: 'DHAN_TRADES',
      lastVerifiedAt: trade.asOf,
    };
  }

  private upsertFromBrokerMapping(
    normalizedSymbol: string,
    mapping: {
      exchange: string;
      securityId: string;
      isin: string | null;
      instrumentType: string;
      source: string;
      lastVerifiedAt: Date;
    },
  ) {
    return this.prisma.instrument.upsert({
      where: {
        symbol_exchange: {
          symbol: normalizedSymbol,
          exchange: mapping.exchange,
        },
      },
      create: {
        symbol: normalizedSymbol,
        exchange: mapping.exchange,
        securityId: mapping.securityId,
        isin: mapping.isin,
        name: normalizedSymbol,
        instrumentType: mapping.instrumentType,
        source: mapping.source,
        lastVerifiedAt: mapping.lastVerifiedAt,
      },
      update: {
        securityId: mapping.securityId,
        isin: mapping.isin,
        instrumentType: mapping.instrumentType,
        source: mapping.source,
        lastVerifiedAt: mapping.lastVerifiedAt,
        isActive: true,
      },
    });
  }

  serialize(instrument: {
    id: string;
    symbol: string;
    exchange: string;
    securityId: string | null;
    isin: string | null;
    name: string;
    instrumentType: string;
    sector: string | null;
    industry: string | null;
    isActive: boolean;
    source: string;
    lastVerifiedAt: Date | null;
  }) {
    const warnings = instrument.securityId ? [] : ['SECURITY_ID_MISSING'];

    return {
      id: instrument.id,
      symbol: instrument.symbol,
      exchange: instrument.exchange,
      securityId: instrument.securityId,
      isin: instrument.isin,
      name: instrument.name,
      instrumentType: instrument.instrumentType,
      sector: instrument.sector,
      industry: instrument.industry,
      isActive: instrument.isActive,
      source: instrument.source,
      asOf: instrument.lastVerifiedAt,
      timestamp: instrument.lastVerifiedAt,
      dataQuality: {
        freshness: instrument.lastVerifiedAt ? 'RECENT' : 'MISSING',
        confidence: instrument.securityId ? 'MEDIUM' : 'LOW',
      },
      warnings,
    };
  }

  private normalizeSymbol(symbol: string) {
    return symbol.trim().toUpperCase();
  }
}

function exchangeFromSegment(segment: string | null | undefined) {
  const normalized = segment?.toUpperCase() ?? '';

  if (normalized.includes('BSE')) {
    return 'BSE';
  }

  return 'NSE';
}
