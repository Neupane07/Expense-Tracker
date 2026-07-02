import { Test, TestingModule } from '@nestjs/testing';
import { CorporateActionPolicyService } from './corporate-action-policy.service';
import { InstrumentVerificationService } from './instrument-verification.service';

describe('InstrumentVerificationService', () => {
  let service: InstrumentVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CorporateActionPolicyService, InstrumentVerificationService],
    }).compile();

    service = module.get(InstrumentVerificationService);
  });

  it('marks master-backed mappings as verified', () => {
    const result = service.evaluateInstrumentMapping({
      symbol: 'INFY',
      securityId: '12345',
      source: 'DHAN_SCRIP_MASTER',
      lastVerifiedAt: new Date('2026-06-01T10:00:00.000Z'),
      lifecycleStatus: 'ACTIVE' as const,
    });

    expect(result.mappingStatus).toBe('VERIFIED');
    expect(result.verified).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('marks broker-derived mappings as inferred', () => {
    const result = service.evaluateInstrumentMapping({
      symbol: 'INFY',
      securityId: '12345',
      source: 'DHAN_HOLDINGS',
      lastVerifiedAt: new Date('2026-06-01T10:00:00.000Z'),
    });

    expect(result.mappingStatus).toBe('INFERRED');
    expect(result.verified).toBe(true);
    expect(result.warnings).toContain(
      'INSTRUMENT_MAPPING_INFERRED_FROM_BROKER',
    );
    expect(result.blockers).toHaveLength(0);
  });

  it('blocks ambiguous and inactive lifecycle states', () => {
    const ambiguous = service.evaluateInstrumentMapping({
      symbol: 'DUPA',
      securityId: '1',
      source: 'DHAN_SCRIP_MASTER',
      lastVerifiedAt: new Date('2026-06-01T10:00:00.000Z'),
      mappingStatus: 'AMBIGUOUS',
      blockers: ['INSTRUMENT_MAPPING_AMBIGUOUS'],
    });

    expect(ambiguous.mappingStatus).toBe('AMBIGUOUS');
    expect(ambiguous.blockers).toContain('INSTRUMENT_MAPPING_AMBIGUOUS');

    const inactive = service.evaluateInstrumentMapping({
      symbol: 'OLD',
      securityId: '2',
      source: 'DHAN_SCRIP_MASTER',
      lastVerifiedAt: new Date('2026-06-01T10:00:00.000Z'),
      lifecycleStatus: 'INACTIVE' as const,
    });

    expect(inactive.blockers).toContain('INSTRUMENT_INACTIVE');
  });

  it('blocks when security mapping is missing', () => {
    const result = service.evaluateInstrumentMapping({
      symbol: 'UNKNOWN',
      securityId: null,
      source: null,
      lastVerifiedAt: null,
    });

    expect(result.mappingStatus).toBe('MISSING');
    expect(result.blockers).toContain('INSTRUMENT_MAPPING_MISSING');
  });

  it('blocks historical analysis when adjustment is not independently verified', () => {
    const unadjusted = service.evaluateCorporateActionPolicy({
      candleCount: 120,
      unadjustedCount: 120,
      providerClaimsAdjusted: false,
    });
    const storedAdjustedFlagOnly = service.evaluateCorporateActionPolicy({
      candleCount: 120,
      unadjustedCount: 0,
      providerClaimsAdjusted: false,
    });

    for (const result of [unadjusted, storedAdjustedFlagOnly]) {
      expect(result.adjustmentStatus).toBe('UNVERIFIED');
      expect(result.blocksHistoricalAnalysis).toBe(true);
      expect(result.blockers).toContain(
        'CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED',
      );
    }
  });

  it('verifies provider-adjusted Dhan daily candles without event catalog', () => {
    const result = service.evaluateCorporateActionPolicy({
      candleCount: 10,
      unadjustedCount: 0,
      providerClaimsAdjusted: true,
    });

    expect(result.providerAvailable).toBe(true);
    expect(result.eventProviderAvailable).toBe(false);
    expect(result.adjustmentStatus).toBe('VERIFIED');
    expect(result.blocksHistoricalAnalysis).toBe(false);
  });
});
