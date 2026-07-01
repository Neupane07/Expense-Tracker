import { Module } from '@nestjs/common';
import { DhanModule } from '../broker/dhan/dhan.module';
import { CandlesService } from './candles.service';
import { DhanMarketDataProviderService } from './dhan-market-data-provider.service';
import { IndicatorsService } from './indicators.service';
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
    PricesService,
    CandlesService,
    IndicatorsService,
    MarketDataQualityService,
    InstrumentVerificationService,
    DhanMarketDataProviderService,
  ],
  exports: [
    MarketDataService,
    InstrumentsService,
    PricesService,
    CandlesService,
    IndicatorsService,
    MarketDataQualityService,
    InstrumentVerificationService,
    DhanMarketDataProviderService,
  ],
})
export class MarketDataModule {}
