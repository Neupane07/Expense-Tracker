import { BadRequestException } from '@nestjs/common';
import { PortfolioService } from '../portfolio/portfolio.service';
import { TradeValidationService } from '../risk/trade-validation.service';
import { ResearchSnapshotService } from '../research/research-snapshot.service';
import { ScannerReadinessService } from '../scanner/scanner-readiness.service';
import { SwingScannerService } from '../scanner/swing-scanner.service';
import { CreateManualSuperOrderPlanTool } from './tools/create-manual-super-order-plan.tool';
import { GetPortfolioSnapshotTool } from './tools/get-portfolio-snapshot.tool';
import { GetResearchSnapshotTool } from './tools/get-research-snapshot.tool';
import { GetScannerReadinessTool } from './tools/get-scanner-readiness.tool';
import { ScanSwingCandidatesTool } from './tools/scan-swing-candidates.tool';
import { ValidateTradeSetupTool } from './tools/validate-trade-setup.tool';

const context = {
  userId: 'user-a',
  userEmail: 'user-a@example.com',
  userRole: 'MEMBER',
};

describe('Tool handlers', () => {
  it('get_portfolio_snapshot returns unavailable when warnings indicate missing context', async () => {
    const tool = new GetPortfolioSnapshotTool({
      getSnapshot: jest.fn().mockResolvedValue({
        id: 'snap-1',
        snapshotTime: new Date('2026-06-14T00:00:00.000Z'),
        warnings: ['No synced Dhan holdings are available.'],
        source: {},
        priceAsOf: null,
        listedSummary: { fallbackCount: 0, holdingCount: 0 },
      }),
    } as unknown as PortfolioService);

    const result = await tool.handle(context);

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain('PORTFOLIO_CONTEXT_INCOMPLETE');
  });

  it('get_portfolio_snapshot returns rejected for stale prices', async () => {
    const tool = new GetPortfolioSnapshotTool({
      getSnapshot: jest.fn().mockResolvedValue({
        id: 'snap-1',
        snapshotTime: new Date('2026-06-14T00:00:00.000Z'),
        warnings: ['PRICE_STALE'],
        listedSummary: { fallbackCount: 0, holdingCount: 2 },
        priceAsOf: new Date('2026-06-14T00:00:00.000Z'),
        source: {},
      }),
    } as unknown as PortfolioService);

    const result = await tool.handle(context);

    expect(result.status).toBe('rejected');
    expect(result.rejectReasons).toContain('PRICE_STALE');
  });

  it('get_scanner_readiness maps BLOCKED to unavailable', async () => {
    const tool = new GetScannerReadinessTool({
      getReadiness: jest.fn().mockResolvedValue({
        status: 'BLOCKED',
        warnings: [],
        blockers: ['DHAN_NOT_CONNECTED'],
        checks: [],
        source: 'scanner-readiness',
        asOf: '2026-06-14T00:00:00.000Z',
      }),
    } as unknown as ScannerReadinessService);

    const result = await tool.handle(context, {});

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toEqual(['DHAN_NOT_CONNECTED']);
  });

  it('scan_swing_candidates maps readiness BadRequestException to unavailable', async () => {
    const tool = new ScanSwingCandidatesTool({
      runScan: jest.fn().mockRejectedValue(
        new BadRequestException({
          status: 'BLOCKED',
          blockers: ['PRICE_STALE'],
          warnings: [],
        }),
      ),
    } as unknown as SwingScannerService);

    const result = await tool.handle(context, {});

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain('PRICE_STALE');
  });

  it('validate_trade_setup returns rejected when validation fails', async () => {
    const tool = new ValidateTradeSetupTool({
      validateTrade: jest.fn().mockResolvedValue({
        valid: false,
        rejectReasons: ['PRICE_STALE'],
        warnings: [],
        dataQuality: { freshness: 'STALE' },
      }),
    } as unknown as TradeValidationService);

    const result = await tool.handle(context, {
      symbol: 'TCS',
      side: 'BUY',
      entry: 100,
      target: 120,
      stopLoss: 95,
      product: 'DELIVERY',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectReasons).toEqual(['PRICE_STALE']);
  });

  it('get_research_snapshot returns unavailable when no items exist', async () => {
    const tool = new GetResearchSnapshotTool({
      getSymbolResearch: jest.fn().mockResolvedValue({
        symbol: 'TCS',
        items: [],
        warnings: ['RESEARCH_EVIDENCE_MISSING'],
        dataQuality: { freshness: 'MISSING' },
        researchSnapshot: null,
      }),
    } as unknown as ResearchSnapshotService);

    const result = await tool.handle(context, { symbol: 'TCS' });

    expect(result.status).toBe('unavailable');
    expect(result.rejectReasons).toContain('RESEARCH_EVIDENCE_MISSING');
  });

  it('create_manual_super_order_plan rejects without broker order side effects', async () => {
    const validateTrade = jest.fn().mockResolvedValue({
      valid: false,
      symbol: 'TCS',
      rejectReasons: ['RISK_REWARD_BELOW_MINIMUM'],
      warnings: [],
      dataQuality: { asOf: '2026-06-14T00:00:00.000Z' },
    });
    const tool = new CreateManualSuperOrderPlanTool({
      validateTrade,
    } as unknown as TradeValidationService);

    const result = await tool.handle(context, {
      symbol: 'TCS',
      side: 'BUY',
      entry: 100,
      target: 105,
      stopLoss: 95,
      product: 'DELIVERY',
    });

    expect(validateTrade).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('rejected');
    expect((result.data as { plan: unknown }).plan).toBeNull();
  });

  it('create_manual_super_order_plan formats BUY/DELIVERY/DAY on success', async () => {
    const tool = new CreateManualSuperOrderPlanTool({
      validateTrade: jest.fn().mockResolvedValue({
        valid: true,
        symbol: 'TCS',
        entry: 100,
        target: 120,
        stopLoss: 95,
        quantity: 10,
        rejectReasons: [],
        warnings: [],
        dataQuality: { asOf: '2026-06-14T00:00:00.000Z' },
      }),
    } as unknown as TradeValidationService);

    const result = await tool.handle(context, {
      symbol: 'TCS',
      side: 'BUY',
      entry: 100,
      target: 120,
      stopLoss: 95,
      product: 'DELIVERY',
    });

    expect(result.status).toBe('ok');
    expect((result.data as { plan: Record<string, unknown> }).plan).toEqual({
      side: 'BUY',
      product: 'DELIVERY',
      validity: 'DAY',
      symbol: 'TCS',
      quantity: 10,
      limitPrice: 100,
      targetPrice: 120,
      stopLossPrice: 95,
    });
  });
});
