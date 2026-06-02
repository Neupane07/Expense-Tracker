import { Module } from '@nestjs/common';
import { BrokerController } from './broker.controller';
import { BrokerHoldingsQueryService } from './broker-holdings-query.service';
import { BrokerService } from './broker.service';
import { DhanModule } from './dhan/dhan.module';

@Module({
  imports: [DhanModule],
  controllers: [BrokerController],
  providers: [BrokerService, BrokerHoldingsQueryService],
  exports: [BrokerService, BrokerHoldingsQueryService, DhanModule],
})
export class BrokerModule {}
