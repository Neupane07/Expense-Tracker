import { ForbiddenException } from '@nestjs/common';
import { BrokerCredentialsService } from '../broker-credentials.service';
import { DhanAuthService } from './dhan-auth.service';
import { DhanClient } from './dhan.client';

function createAuthService(options?: {
  saveApp?: jest.Mock;
  saveToken?: jest.Mock;
  savePending?: jest.Mock;
  getPending?: jest.Mock;
  clearPending?: jest.Mock;
  getConnection?: jest.Mock;
  getCredentials?: jest.Mock;
  renewToken?: jest.Mock;
  fetch?: typeof fetch;
}) {
  const brokerCredentials = {
    saveDhanAppCredentials:
      options?.saveApp ?? jest.fn().mockResolvedValue({ connected: true }),
    saveDhanAccessToken:
      options?.saveToken ?? jest.fn().mockResolvedValue({ connected: true }),
    saveDhanPendingConnect:
      options?.savePending ?? jest.fn().mockResolvedValue(undefined),
    getDhanPendingConnect:
      options?.getPending ??
      jest.fn().mockResolvedValue({
        clientId: '1000000001',
        consentAppId: 'consent-123',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    clearDhanPendingConnect:
      options?.clearPending ?? jest.fn().mockResolvedValue(undefined),
    getDhanConnection:
      options?.getConnection ??
      jest.fn().mockResolvedValue({
        connected: true,
        hasAccessToken: true,
        accessTokenExpiresAt: '2026-07-02T10:00:00.000Z',
      }),
    getDhanCredentials:
      options?.getCredentials ??
      jest.fn().mockResolvedValue({
        apiKey: 'app-key',
        apiSecret: 'app-secret',
        clientId: '1000000001',
        accessToken: 'token',
        accessTokenExpiresAt: null,
      }),
  } as unknown as BrokerCredentialsService;

  const dhanClient = {
    renewAccessToken:
      options?.renewToken ??
      jest.fn().mockResolvedValue({
        accessToken: 'renewed-token',
        expiryTime: '2026-07-02T12:00:00.000Z',
      }),
  } as unknown as DhanClient;

  const config = {
    get: (key: string) => {
      if (key === 'AUTH_COOKIE_SECRET') {
        return 'test-auth-secret-with-32-bytes-min';
      }
      if (key === 'DHAN_CONNECT_CALLBACK_URL') {
        return 'http://localhost:4000/broker/dhan/connect/callback';
      }
      if (key === 'FRONTEND_URL') {
        return 'http://localhost:5173';
      }
      return undefined;
    },
  };

  const service = new DhanAuthService(
    brokerCredentials,
    dhanClient,
    config as never,
  );
  const fetchMock = (options?.fetch ?? jest.fn()) as jest.MockedFunction<
    typeof fetch
  >;
  global.fetch = fetchMock;

  return { service, brokerCredentials, dhanClient, fetchMock };
}

describe('DhanAuthService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts connect by saving app credentials and returning a Dhan login URL', async () => {
    const saveApp = jest.fn().mockResolvedValue({ connected: true });
    const savePending = jest.fn().mockResolvedValue(undefined);
    const { service, fetchMock } = createAuthService({ saveApp, savePending });
    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ consentAppId: 'consent-123', status: 'success' }),
    } as Response);

    const response = {
      cookie: jest.fn(),
    };

    const result = await service.startConnect('user-1', response as never, {
      apiKey: 'app-key',
      apiSecret: 'app-secret',
      clientId: '1000000001',
    });

    expect(saveApp).toHaveBeenCalled();
    expect(savePending).toHaveBeenCalled();
    expect(result.loginUrl).toContain('consentAppId=consent-123');
    expect(response.cookie).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/generate-consent'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('completes connect for the signed-in user via token exchange', async () => {
    const saveToken = jest.fn().mockResolvedValue({ connected: true });
    const clearPending = jest.fn().mockResolvedValue(undefined);
    const { service, fetchMock } = createAuthService({
      saveToken,
      clearPending,
      getCredentials: jest.fn().mockResolvedValue({
        apiKey: 'app-key',
        apiSecret: 'app-secret',
        clientId: '1000000001',
        accessToken: null,
        accessTokenExpiresAt: null,
      }),
    });

    fetchMock.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          accessToken: 'issued-token',
          expiryTime: '2026-07-02T10:00:00.000Z',
          dhanClientId: '1000000001',
        }),
    } as Response);

    const connection = await service.completeConnectForUser(
      'user-1',
      'token-id-123',
    );

    expect(saveToken).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        accessToken: 'issued-token',
        clientId: '1000000001',
      }),
    );
    expect(clearPending).toHaveBeenCalledWith('user-1');
    expect(JSON.stringify(connection)).not.toContain('issued-token');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/app/consumeApp-consent'),
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('rejects connect completion when the signed session cookie is missing', async () => {
    const { service } = createAuthService();

    await expect(
      service.completeConnect(
        { headers: {} } as never,
        { clearCookie: jest.fn() } as never,
        'token-id',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('renews an active token through Dhan RenewToken and persists expiry metadata', async () => {
    const saveToken = jest.fn().mockResolvedValue({ connected: true });
    const renewToken = jest.fn().mockResolvedValue({
      accessToken: 'renewed-token',
      expiryTime: '2026-07-02T12:00:00.000Z',
    });
    const { service } = createAuthService({ saveToken, renewToken });

    const result = await service.renewAccessToken('user-1');

    expect(renewToken).toHaveBeenCalledWith('user-1');
    expect(saveToken).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ accessToken: 'renewed-token' }),
    );
    expect(result.renewedAt).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain('renewed-token');
  });
});
