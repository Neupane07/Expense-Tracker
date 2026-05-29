import { Injectable } from '@nestjs/common';

@Injectable()
export class MarketDataService {
  getStatus() {
    return {
      module: 'market-data',
      status: 'placeholder',
    };
  }
}
