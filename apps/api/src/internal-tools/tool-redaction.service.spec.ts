import { ToolRedactionService } from './tool-redaction.service';

describe('ToolRedactionService', () => {
  const service = new ToolRedactionService();

  it('redacts realistic secret-shaped keys and values', () => {
    const input = {
      symbol: 'RELIANCE',
      apiKey: 'dhan-api-key-abcdef123456',
      apiSecret: 'super-secret-value',
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig',
      sessionCookie: 'finance_os_session=opaque-token-value',
      nested: {
        authorization: 'Bearer abc.def.ghi',
      },
    };

    const redacted = service.redactValue(input);

    expect(redacted).toEqual({
      symbol: 'RELIANCE',
      apiKey: '[REDACTED]',
      apiSecret: '[REDACTED]',
      accessToken: '[REDACTED]',
      sessionCookie: '[REDACTED]',
      nested: {
        authorization: '[REDACTED]',
      },
    });
  });

  it('builds hashed input metadata without raw secrets', () => {
    const hashA = service.hashInputMeta({ symbol: 'TCS', entry: 100 });
    const hashB = service.hashInputMeta({ symbol: 'INFY', entry: 100 });

    expect(hashA).not.toContain('secret');
    expect(hashB).not.toContain('secret');
    expect(hashA).not.toEqual(hashB);
  });

  it('stores audit metadata as keys and field types only', () => {
    const meta = service.buildInputMeta({
      symbol: 'INFY',
      entry: 1500,
      target: 1600,
      stopLoss: 1450,
      quantity: 10,
      accessToken: 'should-not-appear',
    });

    expect(meta.keys).toEqual([
      'accessToken',
      'entry',
      'quantity',
      'stopLoss',
      'symbol',
      'target',
    ]);
    expect(JSON.stringify(meta)).not.toContain('1500');
    expect(JSON.stringify(meta)).not.toContain('should-not-appear');
    expect(meta.fieldTypes).toEqual({
      accessToken: 'redacted',
      entry: 'redacted',
      quantity: 'redacted',
      stopLoss: 'redacted',
      symbol: 'string',
      target: 'redacted',
    });
  });
});
