import { Module } from '@nestjs/common';
import { DhanModule } from '../broker/dhan/dhan.module';
import { CandlesService } from './candles.service';
import { CorporateActionPolicyService } from './corporate-action-policy.service';
import {
  CorporateActionImportService,
  CorporateActionInvalidationService,
  CorporateActionSyncService,
} from './corporate-action.service';
import { DhanMarketDataProviderService } from './dhan-market-data-provider.service';
import { IndicatorsService } from './indicators.service';
import { InstrumentMasterMappingService } from './instrument-master-mapping.service';
import { InstrumentMasterSyncService } from './instrument-master-sync.service';
import { InstrumentsService } from './instruments.service';
import { InstrumentVerificationService } from './instrument-verification.service';
import { MarketDataController } from './market-data.controller';
import { MarketDataQualityService } from './market-data-quality.service';
import { MarketDataService } from './market-data.service';
import { PricesService } from './prices.service';

@Module({
  imports: [DhanModule],
  controllers: [MarketDataController],
  providers: [
    MarketDataService,
    InstrumentsService,
    InstrumentMasterSyncService,
    InstrumentMasterMappingService,
    PricesService,
    CandlesService,
    IndicatorsService,
    MarketDataQualityService,
    CorporateActionPolicyService,
    CorporateActionInvalidationService,
    CorporateActionImportService,
    CorporateActionSyncService,
    InstrumentVerificationService,
    DhanMarketDataProviderService,
  ],
  exports: [
    MarketDataService,
    InstrumentsService,
    InstrumentMasterSyncService,
    InstrumentMasterMappingService,
    PricesService,
    CandlesService,
    IndicatorsService,
    MarketDataQualityService,
    CorporateActionPolicyService,
    CorporateActionSyncService,
    InstrumentVerificationService,
    DhanMarketDataProviderService,
  ],
})
export class MarketDataModule {}
