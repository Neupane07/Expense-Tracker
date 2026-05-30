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

    if (!latestHolding) {
      throw new NotFoundException(
        `Instrument ${normalizedSymbol} is not mapped yet.`,
      );
    }

    return this.prisma.instrument.upsert({
      where: {
        symbol_exchange: {
          symbol: normalizedSymbol,
          exchange: latestHolding.exchange ?? 'NSE',
        },
      },
      create: {
        symbol: normalizedSymbol,
        exchange: latestHolding.exchange ?? 'NSE',
        securityId: latestHolding.securityId,
        isin: latestHolding.isin,
        name: normalizedSymbol,
        instrumentType: latestHolding.assetClass === 'ETF' ? 'ETF' : 'EQUITY',
        source: 'DHAN_HOLDINGS',
        lastVerifiedAt: latestHolding.asOf,
      },
      update: {
        securityId: latestHolding.securityId,
        isin: latestHolding.isin,
        instrumentType: latestHolding.assetClass === 'ETF' ? 'ETF' : 'EQUITY',
        source: 'DHAN_HOLDINGS',
        lastVerifiedAt: latestHolding.asOf,
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
