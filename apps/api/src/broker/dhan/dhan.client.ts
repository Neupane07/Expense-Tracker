import { BadRequestException, Injectable } from '@nestjs/common';
import { BrokerCredentialsService } from '../broker-credentials.service';
import type {
  DhanCredentials,
  DhanFundLimit,
  DhanHistoricalResponse,
  DhanHolding,
  DhanOrder,
  DhanPosition,
  DhanQuoteResponse,
  DhanTrade,
} from './dhan.types';

@Injectable()
export class DhanClient {
  private readonly baseUrl = 'https://api.dhan.co/v2';

  constructor(private readonly brokerCredentials: BrokerCredentialsService) {}

  async getConfiguredClientId(userId: string) {
    return (await this.getCredentials(userId)).clientId;
  }

  async getHoldings(userId: string) {
    return this.getJson<DhanHolding[]>(userId, '/holdings');
  }

  async getPositions(userId: string) {
    return this.getJson<DhanPosition[]>(userId, '/positions');
  }

  async getOrders(userId: string) {
    return this.getJson<DhanOrder[]>(userId, '/orders');
  }

  async getTrades(userId: string) {
    return this.getJson<DhanTrade[]>(userId, '/trades');
  }

  async getFundLimit(userId: string) {
    return this.getJson<DhanFundLimit>(userId, '/fundlimit');
  }

  async getMarketQuote(
    userId: string,
    exchangeSegment: string,
    securityId: string,
  ) {
    return this.postJson<DhanQuoteResponse>(userId, '/marketfeed/quote', {
      [exchangeSegment]: [Number(securityId)],
    });
  }

  async getMarketQuotes(
    userId: string,
    securityIdsBySegment: Record<string, string[]>,
  ) {
    const body: Record<string, number[]> = {};

    for (const [segment, ids] of Object.entries(securityIdsBySegment)) {
      const numericIds = ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (numericIds.length > 0) {
        body[segment] = numericIds;
      }
    }

    if (Object.keys(body).length === 0) {
      return { data: {} } satisfies DhanQuoteResponse;
    }

    return this.postJson<DhanQuoteResponse>(userId, '/marketfeed/quote', body);
  }

  async getHistoricalDailyCandles(
    userId: string,
    input: {
      securityId: string;
      exchangeSegment: string;
      instrument: string;
      fromDate: string;
      toDate: string;
    },
  ) {
    return this.postJson<DhanHistoricalResponse>(userId, '/charts/historical', {
      securityId: input.securityId,
      exchangeSegment: input.exchangeSegment,
      instrument: input.instrument,
      expiryCode: 0,
      oi: false,
      fromDate: input.fromDate,
      toDate: input.toDate,
    });
  }

  private async getJson<T>(userId: string, path: string) {
    const credentials = await this.getCredentials(userId);
    const response = await fetch(`${credentials.baseUrl}${path}`, {
      method: 'GET',
      headers: this.buildHeaders(credentials),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new BadRequestException(
        `Dhan ${path} request failed with ${response.status}: ${body}`,
      );
    }

    return (await response.json()) as T;
  }

  private async postJson<T>(userId: string, path: string, body: unknown) {
    const credentials = await this.getCredentials(userId);
    const response = await fetch(`${credentials.baseUrl}${path}`, {
      method: 'POST',
      headers: this.buildHeaders(credentials),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new BadRequestException(
        `Dhan ${path} request failed with ${response.status}: ${responseBody}`,
      );
    }

    return (await response.json()) as T;
  }

  private async getCredentials(userId: string): Promise<DhanCredentials> {
    const credentials = await this.brokerCredentials.getDhanCredentials(userId);

    if (!credentials.accessToken) {
      throw new BadRequestException(
        'Dhan access token is required for read-only broker sync.',
      );
    }

    return {
      ...credentials,
      accessToken: credentials.accessToken,
      baseUrl: this.baseUrl,
    };
  }

  private buildHeaders(credentials: DhanCredentials) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'access-token': credentials.accessToken,
      'client-id': credentials.clientId,
    };

    return headers;
  }
}
