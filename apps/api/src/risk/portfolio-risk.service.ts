import { Injectable } from '@nestjs/common';
import { ExposureService } from './exposure.service';

@Injectable()
export class PortfolioRiskService {
  constructor(private readonly exposureService: ExposureService) {}

  getPortfolioRisk(userId: string) {
    return this.exposureService.getPortfolioRisk(userId);
  }
}
