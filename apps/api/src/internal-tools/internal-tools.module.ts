import { Module } from '@nestjs/common';
import { MarketDataModule } from '../market-data/market-data.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { ResearchModule } from '../research/research.module';
import { RiskModule } from '../risk/risk.module';
import { ScannerModule } from '../scanner/scanner.module';
import { InternalToolsController } from './internal-tools.controller';
import { ToolAuditService } from './tool-audit.service';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRedactionService } from './tool-redaction.service';
import { ToolRegistrationService } from './tool-registration.service';
import { ToolRegistryService } from './tool-registry.service';
import { CreateManualSuperOrderPlanTool } from './tools/create-manual-super-order-plan.tool';
import { GetMarketDataStatusTool } from './tools/get-market-data-status.tool';
import { GetPortfolioSnapshotTool } from './tools/get-portfolio-snapshot.tool';
import { GetResearchSnapshotTool } from './tools/get-research-snapshot.tool';
import { GetScannerReadinessTool } from './tools/get-scanner-readiness.tool';
import { GetStockDeepDiveTool } from './tools/get-stock-deep-dive.tool';
import { ScanSwingCandidatesTool } from './tools/scan-swing-candidates.tool';
import { ValidateTradeSetupTool } from './tools/validate-trade-setup.tool';

@Module({
  imports: [
    PortfolioModule,
    MarketDataModule,
    ScannerModule,
    RiskModule,
    ResearchModule,
  ],
  controllers: [InternalToolsController],
  providers: [
    ToolRegistryService,
    ToolExecutorService,
    ToolAuditService,
    ToolRedactionService,
    ToolRegistrationService,
    GetPortfolioSnapshotTool,
    GetMarketDataStatusTool,
    GetScannerReadinessTool,
    ScanSwingCandidatesTool,
    ValidateTradeSetupTool,
    GetStockDeepDiveTool,
    GetResearchSnapshotTool,
    CreateManualSuperOrderPlanTool,
  ],
  exports: [ToolRegistryService, ToolExecutorService],
})
export class InternalToolsModule {}
