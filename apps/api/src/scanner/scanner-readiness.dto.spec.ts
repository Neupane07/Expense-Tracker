import { BadRequestException } from '@nestjs/common';
import { parseScannerReadinessQuery } from './scanner-readiness.dto';

describe('parseScannerReadinessQuery', () => {
  it('parses explicit symbols', () => {
    expect(parseScannerReadinessQuery({ symbols: 'infy,tcs' })).toEqual({
      symbols: ['INFY', 'TCS'],
    });
  });

  it('rejects unknown query parameters', () => {
    expect(() =>
      parseScannerReadinessQuery({ symbols: 'INFY', universe: 'symbols' }),
    ).toThrow(BadRequestException);
  });
});
