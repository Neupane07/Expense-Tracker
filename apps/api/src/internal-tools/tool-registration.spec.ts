import { ToolRegistryService } from './tool-registry.service';
import { ToolRegistrationService } from './tool-registration.service';
import { Test, TestingModule } from '@nestjs/testing';
import { PortfolioService } from '../portfolio/portfolio.service';
import { PrismaService } from '../prisma/prisma.service';
import { InstrumentVerificationService } from '../market-data/instrument-verification.service';
import { MarketDataQualityService } from '../market-data/market-data-quality.service';
import { InstrumentsService } from '../market-data/instruments.service';
import { CandlesService } from '../market-data/candles.service';
import { IndicatorsService } from '../market-data/indicators.service';
import { PricesService } from '../market-data/prices.service';
import { ScannerReadinessService } from '../scanner/scanner-readiness.service';
import { SwingScannerService } from '../scanner/swing-scanner.service';
import { TradeValidationService } from '../risk/trade-validation.service';
import { MarketDataService } from '../market-data/market-data.service';
import { ResearchSnapshotService } from '../research/research-snapshot.service';
import { GetPortfolioSnapshotTool } from './tools/get-portfolio-snapshot.tool';
import { GetMarketDataStatusTool } from './tools/get-market-data-status.tool';
import { GetScannerReadinessTool } from './tools/get-scanner-readiness.tool';
import { ScanSwingCandidatesTool } from './tools/scan-swing-candidates.tool';
import { ValidateTradeSetupTool } from './tools/validate-trade-setup.tool';
import { GetStockDeepDiveTool } from './tools/get-stock-deep-dive.tool';
import { GetResearchSnapshotTool } from './tools/get-research-snapshot.tool';
import { CreateManualSuperOrderPlanTool } from './tools/create-manual-super-order-plan.tool';

describe('ToolRegistrationService', () => {
  it('registers all initial read-only tools', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ToolRegistryService,
        ToolRegistrationService,
        GetPortfolioSnapshotTool,
        GetMarketDataStatusTool,
        GetScannerReadinessTool,
        ScanSwingCandidatesTool,
        ValidateTradeSetupTool,
        GetStockDeepDiveTool,
        GetResearchSnapshotTool,
        CreateManualSuperOrderPlanTool,
        { provide: PortfolioService, useValue: {} },
        { provide: PrismaService, useValue: {} },
        { provide: InstrumentsService, useValue: {} },
        { provide: PricesService, useValue: {} },
        { provide: CandlesService, useValue: {} },
        { provide: IndicatorsService, useValue: {} },
        { provide: MarketDataQualityService, useValue: {} },
        {
          provide: InstrumentVerificationService,
          useValue: new InstrumentVerificationService(),
        },
        { provide: ScannerReadinessService, useValue: {} },
        { provide: SwingScannerService, useValue: {} },
        { provide: TradeValidationService, useValue: {} },
        { provide: MarketDataService, useValue: {} },
        { provide: ResearchSnapshotService, useValue: {} },
      ],
    }).compile();

    const registration = module.get(ToolRegistrationService);
    const registry = module.get(ToolRegistryService);
    registration.onModuleInit();

    expect(registry.list()).toHaveLength(8);
    expect(registry.list().every((tool) => tool.readOnly)).toBe(true);
  });
});

describe('Tool contract parity', () => {
  it('validate_trade_setup handler returns the same payload as TradeValidationService', async () => {
    const validation = {
      valid: true,
      symbol: 'TCS',
      entry: 100,
      target: 120,
      stopLoss: 95,
      quantity: 10,
      capitalRequired: 1000,
      riskPerShare: 5,
      rewardPerShare: 20,
      riskReward: 4,
      maxLossAmount: 50,
      targetProfitAmount: 200,
      portfolioExposureBefore: { amount: 0, percent: 0 },
      portfolioExposureAfter: { amount: 1000, percent: 5 },
      warnings: [],
      rejectReasons: [],
      dataQuality: {
        source: 'DHAN',
        asOf: '2026-06-14T00:00:00.000Z',
        freshness: 'LIVE',
        confidence: 'HIGH',
        warnings: [],
      },
    };

    const validateTrade = jest.fn().mockResolvedValue(validation);
    const tool = new ValidateTradeSetupTool({
      validateTrade,
    } as unknown as TradeValidationService);

    const result = await tool.handle(
      {
        userId: 'user-a',
        userEmail: 'user-a@example.com',
        userRole: 'MEMBER',
      },
      {
        symbol: 'TCS',
        side: 'BUY',
        entry: 100,
        target: 120,
        stopLoss: 95,
        product: 'DELIVERY',
      },
    );

    expect(result.data).toEqual(validation);
    expect(validateTrade).toHaveBeenCalledWith('user-a', {
      symbol: 'TCS',
      side: 'BUY',
      entry: 100,
      target: 120,
      stopLoss: 95,
      product: 'DELIVERY',
    });
  });
});

describe('Forbidden broker write tools', () => {
  it('registry does not include order placement tools', () => {
    const registry = new ToolRegistryService();

    for (const name of [
      'place_order',
      'modify_order',
      'cancel_order',
      'auto_trade',
      'trail_stop_loss',
    ]) {
      expect(() => registry.get(name)).toThrow('Unknown tool');
    }
  });
});
