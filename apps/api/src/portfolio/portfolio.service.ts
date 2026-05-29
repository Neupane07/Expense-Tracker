import { Injectable } from '@nestjs/common';

@Injectable()
export class PortfolioService {
  getStatus() {
    return {
      module: 'portfolio',
      status: 'placeholder',
    };
  }
}
