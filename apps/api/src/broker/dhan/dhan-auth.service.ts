import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { BrokerCredentialsService } from '../broker-credentials.service';
import { DhanClient } from './dhan.client';
import type {
  DhanAccessTokenResponse,
  DhanConsentResponse,
} from './dhan.types';

const DHAN_OAUTH_COOKIE = 'finance_os_dhan_oauth';
const CONSENT_TTL_MS = 10 * 60 * 1000;

type StartConnectInput = {
  apiKey: string;
  apiSecret: string;
  clientId: string;
};

type PendingConnect = {
  userId: string;
  clientId: string;
  consentAppId: string;
  expiresAt: number;
};

@Injectable()
export class DhanAuthService {
  private readonly authBaseUrl = 'https://auth.dhan.co';

  constructor(
    private readonly brokerCredentials: BrokerCredentialsService,
    private readonly dhanClient: DhanClient,
    private readonly config: ConfigService,
  ) {}

  async startConnect(
    userId: string,
    response: Response,
    input: StartConnectInput,
  ) {
    await this.brokerCredentials.saveDhanAppCredentials(userId, input);

    const consent = await this.generateConsent(input);
    const consentAppId = consent.consentAppId;

    if (!consentAppId) {
      throw new BadRequestException(
        'Dhan did not return a consent session id.',
      );
    }

    const state = this.randomToken();
    const payload = JSON.stringify({
      userId,
      clientId: input.clientId.trim(),
      consentAppId,
      expiresAt: Date.now() + CONSENT_TTL_MS,
    } satisfies PendingConnect);
    const signedPayload = `${state}.${Buffer.from(payload).toString('base64url')}.${this.sign(`${state}.${Buffer.from(payload).toString('base64url')}`)}`;

    await this.brokerCredentials.saveDhanPendingConnect(userId, {
      clientId: input.clientId.trim(),
      consentAppId,
      expiresAt: new Date(Date.now() + CONSENT_TTL_MS),
    });

    response.cookie(DHAN_OAUTH_COOKIE, signedPayload, {
      ...this.baseCookieOptions(),
      maxAge: CONSENT_TTL_MS,
      path: '/',
    });

    return {
      state,
      loginUrl: `${this.authBaseUrl}/login/consentApp-login?consentAppId=${encodeURIComponent(consentAppId)}`,
      callbackUrl: this.callbackUrl(),
      expiresAt: new Date(Date.now() + CONSENT_TTL_MS).toISOString(),
    };
  }

  async completeConnectForUser(userId: string, tokenId: string) {
    const pending =
      (await this.brokerCredentials.getDhanPendingConnect(userId)) ?? null;
    const credentials = await this.brokerCredentials.getDhanCredentials(userId);

    if (pending && credentials.clientId !== pending.clientId) {
      throw new ForbiddenException(
        'Dhan connect session does not match saved client id.',
      );
    }

    const token = await this.consumeConsent({
      tokenId,
      apiKey: credentials.apiKey,
      apiSecret: credentials.apiSecret,
    });

    if (!token.accessToken) {
      throw new BadRequestException('Dhan did not return an access token.');
    }

    await this.brokerCredentials.saveDhanAccessToken(userId, {
      accessToken: token.accessToken,
      accessTokenExpiresAt: this.parseExpiry(token.expiryTime),
      clientId: token.dhanClientId ?? pending?.clientId ?? credentials.clientId,
    });
    await this.brokerCredentials.clearDhanPendingConnect(userId);

    return this.brokerCredentials.getDhanConnection(userId);
  }

  async completeConnect(request: Request, response: Response, tokenId: string) {
    const pending = this.readPendingConnect(request);
    await this.completeConnectForUser(pending.userId, tokenId);

    response.clearCookie(DHAN_OAUTH_COOKIE, {
      ...this.baseCookieOptions(),
      path: '/',
    });

    return this.brokerCredentials.getDhanConnection(pending.userId);
  }

  async renewAccessToken(userId: string) {
    const renewed = await this.dhanClient.renewAccessToken(userId);
    const expiresAt = renewed.expiryTime
      ? new Date(renewed.expiryTime)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (!renewed.accessToken) {
      throw new BadRequestException(
        'Dhan RenewToken did not return an access token.',
      );
    }

    await this.brokerCredentials.saveDhanAccessToken(userId, {
      accessToken: renewed.accessToken,
      accessTokenExpiresAt: expiresAt,
    });

    return {
      connection: await this.brokerCredentials.getDhanConnection(userId),
      renewedAt: new Date().toISOString(),
    };
  }

  redirectAfterConnect(
    response: Response,
    outcome: 'success' | 'failed',
    reason?: string,
  ) {
    const params = new URLSearchParams();
    if (outcome === 'success') {
      params.set('connected', '1');
    } else {
      params.set('error', reason ?? 'connect_failed');
    }

    response.redirect(
      `${this.frontendUrl()}/settings/broker-connections/dhan?${params.toString()}`,
    );
  }

  callbackUrl() {
    return (
      this.config.get<string>('DHAN_CONNECT_CALLBACK_URL') ??
      'http://localhost:4000/broker/dhan/connect/callback'
    );
  }

  private async generateConsent(input: StartConnectInput) {
    const url = new URL(`${this.authBaseUrl}/app/generate-consent`);
    url.searchParams.set('client_id', input.clientId.trim());

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        app_id: input.apiKey.trim(),
        app_secret: input.apiSecret.trim(),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(
        `Dhan consent generation failed with ${response.status}: ${body}`,
      );
    }

    return (await response.json()) as DhanConsentResponse;
  }

  private async consumeConsent(input: {
    tokenId: string;
    apiKey: string;
    apiSecret: string;
  }) {
    const url = new URL(`${this.authBaseUrl}/app/consumeApp-consent`);
    url.searchParams.set('tokenId', input.tokenId.trim());

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        app_id: input.apiKey.trim(),
        app_secret: input.apiSecret.trim(),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(
        `Dhan token exchange failed with ${response.status}: ${body}`,
      );
    }

    return (await response.json()) as DhanAccessTokenResponse;
  }

  private readPendingConnect(request: Request): PendingConnect {
    const cookie = this.readCookie(request, DHAN_OAUTH_COOKIE);
    const parts = cookie?.split('.') ?? [];

    if (parts.length !== 3) {
      throw new ForbiddenException(
        'Dhan connect session is invalid or expired.',
      );
    }

    const payload = parts[1];
    const expectedSignature = this.sign(`${parts[0]}.${payload}`);

    if (!this.equalTokens(expectedSignature, parts[2])) {
      throw new ForbiddenException(
        'Dhan connect session is invalid or expired.',
      );
    }

    const pending = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as PendingConnect;

    if (!pending.userId || !pending.consentAppId || !pending.clientId) {
      throw new ForbiddenException(
        'Dhan connect session is invalid or expired.',
      );
    }

    if (pending.expiresAt < Date.now()) {
      throw new ForbiddenException(
        'Dhan connect session has expired. Start again.',
      );
    }

    return pending;
  }

  private parseExpiry(value: string | undefined) {
    if (!value) {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? new Date(Date.now() + 24 * 60 * 60 * 1000)
      : parsed;
  }

  private frontendUrl() {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  private baseCookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.config.get<string>('NODE_ENV') === 'production',
    };
  }

  private readCookie(request: Request, name: string) {
    const cookies = request.headers.cookie?.split(';') ?? [];

    for (const cookie of cookies) {
      const [cookieName, ...value] = cookie.trim().split('=');

      if (cookieName === name) {
        return decodeURIComponent(value.join('='));
      }
    }

    return undefined;
  }

  private randomToken() {
    return randomBytes(32).toString('base64url');
  }

  private sign(value: string) {
    const secret = this.config.get<string>('AUTH_COOKIE_SECRET')?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'AUTH_COOKIE_SECRET is required for Dhan connect sessions.',
      );
    }

    return createHmac('sha256', secret).update(value).digest('base64url');
  }

  private equalTokens(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
