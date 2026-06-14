import { buildToolEnvelope } from './tool-envelope';

describe('buildToolEnvelope', () => {
  it('returns stable envelope fields', () => {
    const envelope = buildToolEnvelope({
      tool: 'validate_trade_setup',
      version: '1',
      auditId: 'audit-1',
      durationMs: 42,
      result: {
        status: 'rejected',
        data: { valid: false },
        dataQuality: { freshness: 'STALE' },
        warnings: ['WARN'],
        rejectReasons: ['REJECT'],
        asOf: '2026-06-14T00:00:00.000Z',
      },
    });

    expect(envelope).toEqual({
      tool: 'validate_trade_setup',
      version: '1',
      asOf: '2026-06-14T00:00:00.000Z',
      status: 'rejected',
      data: { valid: false },
      dataQuality: { freshness: 'STALE' },
      warnings: ['WARN'],
      rejectReasons: ['REJECT'],
      auditId: 'audit-1',
      durationMs: 42,
    });
  });
});
