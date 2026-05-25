import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { PrismaModule } from './prisma/prisma.module';
import { RulesModule } from './rules/rules.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    AccountsModule,
    ImportsModule,
    TransactionsModule,
    RulesModule,
    DashboardModule,
  ],
})
export class AppModule {}
