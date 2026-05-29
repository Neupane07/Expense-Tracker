import { Module } from '@nestjs/common';
import { DhanClient } from './dhan.client';
import { FundsSyncService } from './funds-sync.service';
import { HoldingsSyncService } from './holdings-sync.service';
import { OrdersSyncService } from './orders-sync.service';
import { PositionsSyncService } from './positions-sync.service';
import { TradesSyncService } from './trades-sync.service';

@Module({
  providers: [
    DhanClient,
    HoldingsSyncService,
    PositionsSyncService,
    OrdersSyncService,
    TradesSyncService,
    FundsSyncService,
  ],
  exports: [
    DhanClient,
    HoldingsSyncService,
    PositionsSyncService,
    OrdersSyncService,
    TradesSyncService,
    FundsSyncService,
  ],
})
export class DhanModule {}
