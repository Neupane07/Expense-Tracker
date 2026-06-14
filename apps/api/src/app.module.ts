import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AccountsModule } from './accounts/accounts.module';
import { AuthModule } from './auth/auth.module';
import { BrokerModule } from './broker/broker.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { ImportsModule } from './imports/imports.module';
import { MarketDataModule } from './market-data/market-data.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { PrismaModule } from './prisma/prisma.module';
import { ResearchModule } from './research/research.module';
import { RiskModule } from './risk/risk.module';
import { RulesModule } from './rules/rules.module';
import { ScannerModule } from './scanner/scanner.module';
import { TradeJournalModule } from './trade-journal/trade-journal.module';
import { InternalToolsModule } from './internal-tools/internal-tools.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    AccountsModule,
    ImportsModule,
    TransactionsModule,
    RulesModule,
    DashboardModule,
    PortfolioModule,
    BrokerModule,
    MarketDataModule,
    ScannerModule,
    RiskModule,
    TradeJournalModule,
    ResearchModule,
    InternalToolsModule,
  ],
})
export class AppModule {}
