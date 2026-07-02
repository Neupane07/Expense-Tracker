import { Injectable } from '@nestjs/common';
import {
  InstrumentLifecycleStatus,
  InstrumentMasterEntry,
} from '../generated/prisma/client';
import type { MappingStatus } from '../common/data-quality';
import { PrismaService } from '../prisma/prisma.service';
import { DHAN_SCRIP_MASTER_SOURCE } from './instrument-master.constants';
import { InstrumentMasterSyncService } from './instrument-master-sync.service';

export type InstrumentMappingConflict = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type InstrumentMappingResolution = {
  symbol: string;
  exchange: string;
  securityId: string | null;
  isin: string | null;
  name: string;
  instrumentType: string;
  lifecycleStatus: InstrumentLifecycleStatus | null;
  mappingStatus: MappingStatus;
  source: string | null;
  masterEntryId: string | null;
  masterAsOf: string | null;
  masterStale: boolean;
  warnings: string[];
  blockers: string[];
  conflicts: InstrumentMappingConflict[];
  precedenceRule: string | null;
};

type BrokerHint = {
  securityId?: string | null;
  isin?: string | null;
  exchange?: string | null;
  source?: string | null;
};

@Injectable()
export class InstrumentMasterMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncService: InstrumentMasterSyncService,
  ) {}

  async resolveSymbol(
    symbol: string,
    brokerHint: BrokerHint = {},
  ): Promise<InstrumentMappingResolution> {
    const normalizedSymbol = symbol.trim().toUpperCase();
    const preferredExchange = normalizeExchange(brokerHint.exchange);
    const masterStatus = await this.syncService.getLatestStatus();
    const masterStale = this.syncService.isMasterStale(masterStatus);
    const warnings: string[] = [];
    const blockers: string[] = [];
    const conflicts: InstrumentMappingConflict[] = [];

    if (!masterStatus?.completedAt) {
      warnings.push('INSTRUMENT_MASTER_NOT_SYNCED');
      return this.resolveWithoutMaster(
        normalizedSymbol,
        preferredExchange,
        brokerHint,
        warnings,
        blockers,
        conflicts,
        masterStale,
        masterStatus?.completedAt ?? null,
      );
    }

    if (masterStale) {
      warnings.push('INSTRUMENT_MASTER_STALE');
    }

    if (brokerHint.securityId) {
      const bySecurityId = await this.lookupBySecurityId(
        brokerHint.securityId,
        preferredExchange,
      );

      if (bySecurityId.length === 1) {
        return this.buildResolutionFromMasterEntry(
          normalizedSymbol,
          bySecurityId[0],
          brokerHint,
          'security_id',
          masterStatus.completedAt,
          masterStale,
          warnings,
          blockers,
          conflicts,
        );
      }

      if (bySecurityId.length > 1) {
        conflicts.push({
          code: 'SECURITY_ID_AMBIGUOUS',
          message: `Broker securityId ${brokerHint.securityId} matches multiple master entries.`,
          details: {
            matches: bySecurityId.map((entry) => summarizeEntry(entry)),
          },
        });
        blockers.push('INSTRUMENT_MAPPING_AMBIGUOUS');
        return this.blockedResolution(
          normalizedSymbol,
          preferredExchange,
          'AMBIGUOUS',
          masterStatus.completedAt,
          masterStale,
          warnings,
          blockers,
          conflicts,
          'security_id',
        );
      }

      if (bySecurityId.length === 0) {
        conflicts.push({
          code: 'SECURITY_ID_NOT_IN_MASTER',
          message: `Broker securityId ${brokerHint.securityId} is absent from the maintained master.`,
          details: { securityId: brokerHint.securityId },
        });
      }
    }

    const symbolMatches = await this.lookupBySymbol(
      normalizedSymbol,
      preferredExchange,
    );
    const activeMatches = symbolMatches.filter(
      (entry) => entry.lifecycleStatus === InstrumentLifecycleStatus.ACTIVE,
    );

    if (activeMatches.length === 1) {
      return this.buildResolutionFromMasterEntry(
        normalizedSymbol,
        activeMatches[0],
        brokerHint,
        'symbol_exchange',
        masterStatus.completedAt,
        masterStale,
        warnings,
        blockers,
        conflicts,
      );
    }

    if (activeMatches.length > 1) {
      conflicts.push({
        code: 'SYMBOL_EXCHANGE_AMBIGUOUS',
        message: `${normalizedSymbol} on ${preferredExchange} maps to multiple active master security IDs.`,
        details: {
          matches: activeMatches.map((entry) => summarizeEntry(entry)),
        },
      });
      blockers.push('INSTRUMENT_MAPPING_AMBIGUOUS');
      return this.blockedResolution(
        normalizedSymbol,
        preferredExchange,
        'AMBIGUOUS',
        masterStatus.completedAt,
        masterStale,
        warnings,
        blockers,
        conflicts,
        'symbol_exchange',
      );
    }

    const inactiveMatch = symbolMatches[0];
    if (inactiveMatch) {
      return this.buildResolutionFromMasterEntry(
        normalizedSymbol,
        inactiveMatch,
        brokerHint,
        'symbol_exchange_inactive',
        masterStatus.completedAt,
        masterStale,
        warnings,
        blockers,
        conflicts,
      );
    }

    if (brokerHint.securityId) {
      blockers.push('INSTRUMENT_MAPPING_CONFLICT');
      return this.blockedResolution(
        normalizedSymbol,
        preferredExchange,
        'UNVERIFIED',
        masterStatus.completedAt,
        masterStale,
        warnings,
        blockers,
        conflicts,
        'broker_security_id_missing_in_master',
      );
    }

    blockers.push('INSTRUMENT_MAPPING_MISSING');
    return this.blockedResolution(
      normalizedSymbol,
      preferredExchange,
      'MISSING',
      masterStatus.completedAt,
      masterStale,
      warnings,
      blockers,
      conflicts,
      null,
    );
  }

  private resolveWithoutMaster(
    symbol: string,
    exchange: string,
    brokerHint: BrokerHint,
    warnings: string[],
    blockers: string[],
    conflicts: InstrumentMappingConflict[],
    masterStale: boolean,
    masterAsOf: Date | null,
  ): InstrumentMappingResolution {
    if (!brokerHint.securityId) {
      blockers.push('INSTRUMENT_MAPPING_MISSING');
      return this.blockedResolution(
        symbol,
        exchange,
        'MISSING',
        masterAsOf,
        masterStale,
        warnings,
        blockers,
        conflicts,
        null,
      );
    }

    if (brokerHint.source?.startsWith('DHAN_')) {
      warnings.push('INSTRUMENT_MAPPING_INFERRED_FROM_BROKER');
      return {
        symbol,
        exchange,
        securityId: brokerHint.securityId,
        isin: brokerHint.isin ?? null,
        name: symbol,
        instrumentType: 'EQUITY',
        lifecycleStatus: InstrumentLifecycleStatus.ACTIVE,
        mappingStatus: 'INFERRED',
        source: brokerHint.source,
        masterEntryId: null,
        masterAsOf: masterAsOf?.toISOString() ?? null,
        masterStale,
        warnings,
        blockers,
        conflicts,
        precedenceRule: 'broker_inferred_no_master',
      };
    }

    blockers.push('INSTRUMENT_MAPPING_MISSING');
    return this.blockedResolution(
      symbol,
      exchange,
      'MISSING',
      masterAsOf,
      masterStale,
      warnings,
      blockers,
      conflicts,
      null,
    );
  }

  private buildResolutionFromMasterEntry(
    requestedSymbol: string,
    entry: InstrumentMasterEntry,
    brokerHint: BrokerHint,
    precedenceRule: string,
    masterAsOf: Date,
    masterStale: boolean,
    warnings: string[],
    blockers: string[],
    conflicts: InstrumentMappingConflict[],
  ): InstrumentMappingResolution {
    const lifecycleBlockers = this.lifecycleBlockers(entry);
    blockers.push(...lifecycleBlockers);

    if (brokerHint.securityId && brokerHint.securityId !== entry.securityId) {
      conflicts.push({
        code: 'BROKER_SECURITY_ID_MISMATCH',
        message: `Broker securityId ${brokerHint.securityId} disagrees with master securityId ${entry.securityId} for ${requestedSymbol}.`,
        details: {
          brokerSecurityId: brokerHint.securityId,
          masterSecurityId: entry.securityId,
          masterSymbol: entry.symbol,
        },
      });
      blockers.push('INSTRUMENT_MAPPING_CONFLICT');
    }

    if (brokerHint.isin && entry.isin && brokerHint.isin !== entry.isin) {
      conflicts.push({
        code: 'BROKER_ISIN_MISMATCH',
        message: `Broker ISIN ${brokerHint.isin} disagrees with master ISIN ${entry.isin}.`,
        details: {
          brokerIsin: brokerHint.isin,
          masterIsin: entry.isin,
        },
      });
      blockers.push('INSTRUMENT_MAPPING_CONFLICT');
    }

    if (
      entry.lifecycleStatus === InstrumentLifecycleStatus.RENAMED &&
      entry.symbol.toUpperCase() !== requestedSymbol
    ) {
      conflicts.push({
        code: 'SYMBOL_RENAMED',
        message: `${requestedSymbol} was renamed to ${entry.supersededBySymbol ?? entry.symbol}.`,
        details: {
          requestedSymbol,
          currentSymbol: entry.symbol,
          supersededBySymbol: entry.supersededBySymbol,
          supersededBySecurityId: entry.supersededBySecurityId,
        },
      });
      blockers.push('INSTRUMENT_SYMBOL_RENAMED');
    }

    const mappingStatus: MappingStatus = blockers.includes(
      'INSTRUMENT_MAPPING_AMBIGUOUS',
    )
      ? 'AMBIGUOUS'
      : blockers.length > 0
        ? 'UNVERIFIED'
        : 'VERIFIED';

    if (mappingStatus === 'VERIFIED' && masterStale) {
      warnings.push('INSTRUMENT_MASTER_STALE');
    }

    return {
      symbol: entry.symbol,
      exchange: entry.exchange,
      securityId: entry.securityId,
      isin: entry.isin,
      name: entry.displayName,
      instrumentType: mapInstrumentType(entry),
      lifecycleStatus: entry.lifecycleStatus,
      mappingStatus,
      source: DHAN_SCRIP_MASTER_SOURCE,
      masterEntryId: entry.id,
      masterAsOf: masterAsOf.toISOString(),
      masterStale,
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      conflicts,
      precedenceRule,
    };
  }

  private blockedResolution(
    symbol: string,
    exchange: string,
    mappingStatus: MappingStatus,
    masterAsOf: Date | null,
    masterStale: boolean,
    warnings: string[],
    blockers: string[],
    conflicts: InstrumentMappingConflict[],
    precedenceRule: string | null,
  ): InstrumentMappingResolution {
    return {
      symbol,
      exchange,
      securityId: null,
      isin: null,
      name: symbol,
      instrumentType: 'EQUITY',
      lifecycleStatus: null,
      mappingStatus,
      source: null,
      masterEntryId: null,
      masterAsOf: masterAsOf?.toISOString() ?? null,
      masterStale,
      warnings: [...new Set(warnings)],
      blockers: [...new Set(blockers)],
      conflicts,
      precedenceRule,
    };
  }

  private lifecycleBlockers(entry: InstrumentMasterEntry) {
    switch (entry.lifecycleStatus) {
      case InstrumentLifecycleStatus.INACTIVE:
        return ['INSTRUMENT_INACTIVE'];
      case InstrumentLifecycleStatus.DELISTED:
        return ['INSTRUMENT_DELISTED'];
      case InstrumentLifecycleStatus.RENAMED:
        return ['INSTRUMENT_SYMBOL_RENAMED'];
      default:
        if (entry.buySellIndicator && entry.buySellIndicator !== 'A') {
          return ['INSTRUMENT_NOT_TRADABLE'];
        }
        return [];
    }
  }

  private lookupBySymbol(symbol: string, exchange: string) {
    return this.prisma.instrumentMasterEntry.findMany({
      where: {
        symbol,
        exchange,
      },
      orderBy: [{ lifecycleStatus: 'asc' }, { lastSeenAt: 'desc' }],
    });
  }

  private lookupBySecurityId(securityId: string, exchange: string) {
    return this.prisma.instrumentMasterEntry.findMany({
      where: {
        securityId,
        exchange,
      },
      orderBy: { lastSeenAt: 'desc' },
    });
  }
}

function normalizeExchange(exchange: string | null | undefined) {
  const normalized = exchange?.trim().toUpperCase() ?? '';

  if (normalized.includes('BSE')) {
    return 'BSE';
  }

  return 'NSE';
}

function mapInstrumentType(entry: InstrumentMasterEntry) {
  if (entry.instrumentType === 'ETF' || entry.series === 'ETF') {
    return 'ETF';
  }

  return 'EQUITY';
}

function summarizeEntry(entry: InstrumentMasterEntry) {
  return {
    id: entry.id,
    symbol: entry.symbol,
    exchange: entry.exchange,
    securityId: entry.securityId,
    isin: entry.isin,
    lifecycleStatus: entry.lifecycleStatus,
  };
}
