import { Injectable, OnModuleInit } from '@nestjs/common';
import { ToolRegistryService } from './tool-registry.service';
import { CreateManualSuperOrderPlanTool } from './tools/create-manual-super-order-plan.tool';
import { GetMarketDataStatusTool } from './tools/get-market-data-status.tool';
import { GetPortfolioSnapshotTool } from './tools/get-portfolio-snapshot.tool';
import { GetResearchSnapshotTool } from './tools/get-research-snapshot.tool';
import { GetScannerReadinessTool } from './tools/get-scanner-readiness.tool';
import { GetStockDeepDiveTool } from './tools/get-stock-deep-dive.tool';
import { ScanSwingCandidatesTool } from './tools/scan-swing-candidates.tool';
import { ValidateTradeSetupTool } from './tools/validate-trade-setup.tool';

@Injectable()
export class ToolRegistrationService implements OnModuleInit {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly getPortfolioSnapshot: GetPortfolioSnapshotTool,
    private readonly getMarketDataStatus: GetMarketDataStatusTool,
    private readonly getScannerReadiness: GetScannerReadinessTool,
    private readonly scanSwingCandidates: ScanSwingCandidatesTool,
    private readonly validateTradeSetup: ValidateTradeSetupTool,
    private readonly getStockDeepDive: GetStockDeepDiveTool,
    private readonly getResearchSnapshot: GetResearchSnapshotTool,
    private readonly createManualSuperOrderPlan: CreateManualSuperOrderPlanTool,
  ) {}

  onModuleInit() {
    for (const tool of [
      this.getPortfolioSnapshot.definition,
      this.getMarketDataStatus.definition,
      this.getScannerReadiness.definition,
      this.scanSwingCandidates.definition,
      this.validateTradeSetup.definition,
      this.getStockDeepDive.definition,
      this.getResearchSnapshot.definition,
      this.createManualSuperOrderPlan.definition,
    ]) {
      this.registry.register(tool);
    }
  }
}
