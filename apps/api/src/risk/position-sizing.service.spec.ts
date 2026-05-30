import { PositionSizingService } from './position-sizing.service';
import { DEFAULT_RISK_SETTINGS } from './risk-settings.service';

describe('PositionSizingService', () => {
  const settings = {
    getSettings: jest.fn(() => DEFAULT_RISK_SETTINGS),
  };

  it('calculates quantity by risk when risk is the limiting constraint', () => {
    const service = new PositionSizingService(settings as never);

    const result = service.calculate({
      entry: 100,
      stopLoss: 90,
      availableCash: 100000,
      totalPortfolioValue: 100000,
    });

    expect(result.quantityByCapital).toBe(200);
    expect(result.quantityByRisk).toBe(50);
    expect(result.quantity).toBe(50);
    expect(result.capitalRequired).toBe(5000);
    expect(result.maxLossAmount).toBe(500);
    expect(result.warnings).toContain('RISK_LIMIT_DETERMINED_QUANTITY');
  });

  it('calculates quantity by capital when capital is the limiting constraint', () => {
    const service = new PositionSizingService(settings as never);

    const result = service.calculate({
      entry: 100,
      stopLoss: 90,
      availableCash: 100000,
      maxCapitalPerTrade: 2000,
      maxRiskPerTrade: 10000,
    });

    expect(result.quantityByCapital).toBe(20);
    expect(result.quantityByRisk).toBe(1000);
    expect(result.quantity).toBe(20);
    expect(result.capitalRequired).toBe(2000);
    expect(result.maxLossAmount).toBe(200);
    expect(result.warnings).toContain('CAPITAL_LIMIT_DETERMINED_QUANTITY');
  });
});
