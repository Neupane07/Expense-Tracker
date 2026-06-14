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

  it('summarizes input meta with key names only', () => {
    const meta = service.buildInputMeta({
      symbol: 'INFY',
      entry: 1500,
      accessToken: 'should-not-appear',
    });

    expect(meta.keys).toEqual(['accessToken', 'entry', 'symbol']);
    expect(JSON.stringify(meta)).not.toContain('should-not-appear');
    expect((meta.preview as Record<string, unknown>).accessToken).toBe(
      '[REDACTED]',
    );
  });
});
