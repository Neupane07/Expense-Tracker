import { Injectable } from '@nestjs/common';

@Injectable()
export class RiskService {
  getStatus() {
    return {
      module: 'risk',
      status: 'placeholder',
    };
  }
}
