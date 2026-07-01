import { Module } from '@nestjs/common';
import { BrokerCredentialsService } from '../broker-credentials.service';
import { DhanAuthService } from './dhan-auth.service';
import { DhanClient } from './dhan.client';
import { DhanQuoteRateLimiterService } from './dhan-quote-rate-limiter.service';
import { FundsSyncService } from './funds-sync.service';
import { HoldingsSyncService } from './holdings-sync.service';
import { OrdersSyncService } from './orders-sync.service';
import { PositionsSyncService } from './positions-sync.service';
import { TradesSyncService } from './trades-sync.service';

@Module({
  providers: [
    BrokerCredentialsService,
    DhanAuthService,
    DhanQuoteRateLimiterService,
    DhanClient,
    HoldingsSyncService,
    PositionsSyncService,
    OrdersSyncService,
    TradesSyncService,
    FundsSyncService,
  ],
  exports: [
    BrokerCredentialsService,
    DhanAuthService,
    DhanQuoteRateLimiterService,
    DhanClient,
    HoldingsSyncService,
    PositionsSyncService,
    OrdersSyncService,
    TradesSyncService,
    FundsSyncService,
  ],
})
export class DhanModule {}
