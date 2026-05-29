import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DhanCredentials,
  DhanFundLimit,
  DhanHolding,
  DhanOrder,
  DhanPosition,
  DhanTrade,
} from './dhan.types';

@Injectable()
export class DhanClient {
  constructor(private readonly configService: ConfigService) {}

  getConfiguredClientId() {
    return this.configService.get<string>('DHAN_CLIENT_ID')?.trim() || null;
  }

  async getHoldings() {
    return this.getJson<DhanHolding[]>('/holdings');
  }

  async getPositions() {
    return this.getJson<DhanPosition[]>('/positions');
  }

  async getOrders() {
    return this.getJson<DhanOrder[]>('/orders');
  }

  async getTrades() {
    return this.getJson<DhanTrade[]>('/trades');
  }

  async getFundLimit() {
    return this.getJson<DhanFundLimit>('/fundlimit');
  }

  private async getJson<T>(path: string) {
    const credentials = this.getCredentials();
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

  private getCredentials(): DhanCredentials {
    const accessToken =
      this.configService.get<string>('DHAN_ACCESS_TOKEN')?.trim() ||
      this.configService.get<string>('DHAN_API_ACCESS_TOKEN')?.trim();

    if (!accessToken) {
      throw new BadRequestException(
        'DHAN_ACCESS_TOKEN is required for Dhan sync',
      );
    }

    return {
      accessToken,
      clientId: this.getConfiguredClientId() ?? undefined,
      baseUrl:
        this.configService.get<string>('DHAN_BASE_URL')?.trim() ||
        'https://api.dhan.co/v2',
    };
  }

  private buildHeaders(credentials: DhanCredentials) {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'access-token': credentials.accessToken,
    };

    if (credentials.clientId) {
      headers['client-id'] = credentials.clientId;
    }

    return headers;
  }
}
