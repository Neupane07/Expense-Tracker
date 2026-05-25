import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { IciciAmazonCardParser } from './parsers/icici-amazon-card.parser';
import { IciciBankParser } from './parsers/icici-bank.parser';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, IciciBankParser, IciciAmazonCardParser],
})
export class ImportsModule {}
