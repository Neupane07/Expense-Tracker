import { ServiceUnavailableException } from '@nestjs/common';
import { BrokerProvider } from '../generated/prisma/client';
import { BrokerCredentialsService } from './broker-credentials.service';

function createService(key?: string, prisma: unknown = {}) {
  return new BrokerCredentialsService(
    prisma as never,
    {
      get: (name: string) =>
        name === 'FINANCE_OS_CREDENTIAL_KEY' ? key : undefined,
    } as never,
  );
}

describe('BrokerCredentialsService', () => {
  it('encrypts and decrypts credentials with authenticated encryption', () => {
    const service = createService('a'.repeat(32));
    const encrypted = service.encrypt('dhan-access-token');

    expect(encrypted.ciphertext).not.toContain('dhan-access-token');
    expect(encrypted.iv).toBeTruthy();
    expect(encrypted.authTag).toBeTruthy();
    expect(service.decrypt(encrypted)).toBe('dhan-access-token');
  });

  it('fails safely when the encryption key is missing', () => {
    const service = createService();

    expect(() => service.encrypt('secret')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('does not return raw broker secrets from connection responses', async () => {
    const prisma = {
      brokerConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'connection-1',
          brokerName: 'Dhan',
          provider: BrokerProvider.DHAN,
          status: 'CONFIGURED',
          clientIdMasked: '****1234',
          apiKeyMasked: '****abcd',
          accessTokenExpiresAt: null,
          lastValidatedAt: null,
          lastSyncAt: null,
          metadata: { readOnly: true },
          credentials: [
            {
              credentialType: 'API_KEY',
              ciphertext: 'raw-api-key-should-not-leak',
            },
            {
              credentialType: 'API_SECRET',
              ciphertext: 'raw-api-secret-should-not-leak',
            },
            {
              credentialType: 'ACCESS_TOKEN',
              ciphertext: 'raw-token-should-not-leak',
            },
          ],
        }),
      },
    };
    const service = createService('b'.repeat(32), prisma);
    const response = await service.getDhanConnection('user-1');
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      connected: true,
      hasApiKey: true,
      hasApiSecret: true,
      hasAccessToken: true,
      clientIdMasked: '****1234',
      apiKeyMasked: '****abcd',
      reconnectRequired: false,
    });
    expect(serialized).not.toContain('raw-api-key-should-not-leak');
    expect(serialized).not.toContain('raw-api-secret-should-not-leak');
    expect(serialized).not.toContain('raw-token-should-not-leak');
  });

  it('marks reconnect required when the access token is expired', async () => {
    const prisma = {
      brokerConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'connection-1',
          brokerName: 'Dhan',
          provider: BrokerProvider.DHAN,
          status: 'CONFIGURED',
          clientIdMasked: '****1234',
          apiKeyMasked: '****abcd',
          accessTokenExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
          lastValidatedAt: null,
          lastSyncAt: null,
          metadata: { readOnly: true },
          credentials: [{ credentialType: 'ACCESS_TOKEN' }],
        }),
      },
    };
    const service = createService('b'.repeat(32), prisma);
    const response = await service.getDhanConnection('user-1');

    expect(response.reconnectRequired).toBe(true);
    expect(response.accessTokenExpired).toBe(true);
  });
});
