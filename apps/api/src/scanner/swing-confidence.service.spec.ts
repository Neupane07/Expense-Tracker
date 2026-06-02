import { scoreSwingConfidence } from './swing-confidence.service';

describe('scoreSwingConfidence', () => {
  const base = {
    setupType: 'BREAKOUT' as const,
    riskReward: 2.2,
    technicalScore: 7,
    volumeScore: 7,
    portfolioFitScore: 7,
    dataQualityScore: 8,
    rsi14: 55,
    distanceFromSma50: 4,
    volumeRatio: 1.3,
    isFallbackPrice: false,
    volumeMissing: false,
    alreadyHeldHighExposure: false,
    marketRegimeRiskOff: false,
    hasFreshNewsOrFiling: false,
    hasStaleResearch: false,
  };

  it('caps confidence for fallback price sources', () => {
    const result = scoreSwingConfidence({
      ...base,
      isFallbackPrice: true,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(6);
    expect(result.confidenceCapReason).toContain('FALLBACK_PRICE_SOURCE');
  });

  it('caps confidence when volume data is missing', () => {
    const result = scoreSwingConfidence({
      ...base,
      volumeMissing: true,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(6);
    expect(result.confidenceCapReason).toContain('VOLUME_DATA_MISSING');
  });

  it('caps confidence for existing high exposure', () => {
    const result = scoreSwingConfidence({
      ...base,
      alreadyHeldHighExposure: true,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(6.5);
    expect(result.confidenceCapReason).toContain('EXISTING_HIGH_EXPOSURE');
  });

  it('caps confidence when research evidence is stale', () => {
    const result = scoreSwingConfidence({
      ...base,
      hasStaleResearch: true,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(6.5);
    expect(result.confidenceCapReason).toContain('STALE_RESEARCH_EVIDENCE');
  });

  it('caps confidence when fresh news or filing is missing', () => {
    const result = scoreSwingConfidence({
      ...base,
      hasFreshNewsOrFiling: false,
    });

    expect(result.confidenceScore).toBeLessThanOrEqual(6.5);
    expect(result.confidenceCapReason).toContain(
      'NO_FRESH_NEWS_OR_FILING_CHECK',
    );
  });
});
