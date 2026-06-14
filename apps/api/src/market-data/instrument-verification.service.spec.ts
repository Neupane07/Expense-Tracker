import { Test, TestingModule } from '@nestjs/testing';
import { InstrumentVerificationService } from './instrument-verification.service';

describe('InstrumentVerificationService', () => {
  let service: InstrumentVerificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InstrumentVerificationService],
    }).compile();

    service = module.get(InstrumentVerificationService);
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
      expect(result.providerAvailable).toBe(false);
      expect(result.blocksHistoricalAnalysis).toBe(true);
      expect(result.blockers).toContain(
        'CORPORATE_ACTION_ADJUSTMENT_UNVERIFIED',
      );
    }
  });

  it('does not pretend a corporate-action provider exists', () => {
    const result = service.evaluateCorporateActionPolicy({
      candleCount: 10,
      unadjustedCount: 0,
      providerClaimsAdjusted: true,
    });

    expect(result.providerAvailable).toBe(false);
    expect(result.blocksHistoricalAnalysis).toBe(false);
  });
});
