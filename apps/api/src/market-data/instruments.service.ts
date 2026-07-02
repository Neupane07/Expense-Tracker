import { Injectable, NotFoundException } from '@nestjs/common';
import { InstrumentLifecycleStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DHAN_SCRIP_MASTER_SOURCE } from './instrument-master.constants';
import { InstrumentMasterMappingService } from './instrument-master-mapping.service';

@Injectable()
export class InstrumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterMapping: InstrumentMasterMappingService,
  ) {}

  async findBySymbol(userId: string, symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const brokerHint =
      (await this.findBrokerHint(userId, normalizedSymbol)) ?? undefined;
    const resolution = await this.masterMapping.resolveSymbol(
      normalizedSymbol,
      brokerHint,
    );

    if (
      resolution.blockers.length > 0 ||
      resolution.mappingStatus === 'AMBIGUOUS' ||
      resolution.mappingStatus === 'MISSING' ||
      (resolution.mappingStatus === 'UNVERIFIED' && !resolution.securityId)
    ) {
      throw new NotFoundException(
        this.buildMappingErrorMessage(normalizedSymbol, resolution),
      );
    }

    if (!resolution.securityId) {
      throw new NotFoundException(
        `Instrument ${normalizedSymbol} is not mapped yet.`,
      );
    }

    const isActive =
      resolution.lifecycleStatus === InstrumentLifecycleStatus.ACTIVE ||
      resolution.mappingStatus === 'INFERRED';

    return this.prisma.instrument.upsert({
      where: {
        symbol_exchange: {
          symbol: resolution.symbol,
          exchange: resolution.exchange,
        },
      },
      create: {
        symbol: resolution.symbol,
        exchange: resolution.exchange,
        securityId: resolution.securityId,
        isin: resolution.isin,
        name: resolution.name,
        instrumentType: resolution.instrumentType,
        source: resolution.source ?? brokerHint?.source ?? 'UNKNOWN',
        lifecycleStatus: resolution.lifecycleStatus,
        masterEntryId: resolution.masterEntryId,
        lastVerifiedAt: resolution.masterAsOf
          ? new Date(resolution.masterAsOf)
          : brokerHint?.lastVerifiedAt,
        isActive,
      },
      update: {
        securityId: resolution.securityId,
        isin: resolution.isin,
        name: resolution.name,
        instrumentType: resolution.instrumentType,
        source: resolution.source ?? brokerHint?.source ?? 'UNKNOWN',
        lifecycleStatus: resolution.lifecycleStatus,
        masterEntryId: resolution.masterEntryId,
        lastVerifiedAt: resolution.masterAsOf
          ? new Date(resolution.masterAsOf)
          : brokerHint?.lastVerifiedAt,
        isActive,
      },
    });
  }

  async resolveMapping(userId: string, symbol: string) {
    const normalizedSymbol = this.normalizeSymbol(symbol);
    const brokerHint =
      (await this.findBrokerHint(userId, normalizedSymbol)) ?? undefined;
    return this.masterMapping.resolveSymbol(normalizedSymbol, brokerHint);
  }

  private async findBrokerHint(userId: string, normalizedSymbol: string) {
    const holdingMapping = await this.findHoldingMapping(
      userId,
      normalizedSymbol,
    );

    if (holdingMapping) {
      return holdingMapping;
    }

    return this.findBrokerRecordMapping(userId, normalizedSymbol);
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
    lifecycleStatus?: InstrumentLifecycleStatus | null;
    source: string;
    lastVerifiedAt: Date | null;
  }) {
    const warnings = instrument.securityId ? [] : ['SECURITY_ID_MISSING'];

    if (instrument.source === DHAN_SCRIP_MASTER_SOURCE) {
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
        lifecycleStatus: instrument.lifecycleStatus,
        source: instrument.source,
        asOf: instrument.lastVerifiedAt,
        timestamp: instrument.lastVerifiedAt,
        dataQuality: {
          freshness: instrument.lastVerifiedAt ? 'RECENT' : 'MISSING',
          confidence: 'HIGH',
          mappingStatus: 'VERIFIED' as const,
        },
        warnings,
      };
    }

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
      lifecycleStatus: instrument.lifecycleStatus,
      source: instrument.source,
      asOf: instrument.lastVerifiedAt,
      timestamp: instrument.lastVerifiedAt,
      dataQuality: {
        freshness: instrument.lastVerifiedAt ? 'RECENT' : 'MISSING',
        confidence: instrument.securityId ? 'MEDIUM' : 'LOW',
        mappingStatus: instrument.source.startsWith('DHAN_')
          ? ('INFERRED' as const)
          : ('UNVERIFIED' as const),
      },
      warnings,
    };
  }

  private buildMappingErrorMessage(
    symbol: string,
    resolution: Awaited<
      ReturnType<InstrumentMasterMappingService['resolveSymbol']>
    >,
  ) {
    const primaryBlocker =
      resolution.blockers[0] ?? 'INSTRUMENT_MAPPING_MISSING';
    const conflict = resolution.conflicts[0]?.message;
    return conflict
      ? `Instrument ${symbol} mapping rejected (${primaryBlocker}): ${conflict}`
      : `Instrument ${symbol} mapping rejected (${primaryBlocker}).`;
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
