import { Injectable } from '@nestjs/common';
import type { PositionSizeInput } from './risk.dto';
import type { RiskSettings } from './risk-settings.service';
import { RiskSettingsService } from './risk-settings.service';

export type PositionSizeResult = {
  entry: number;
  stopLoss: number;
  availableCash: number;
  maxCapitalPerTrade: number;
  maxRiskPerTrade: number;
  riskPerShare: number;
  quantityByCapital: number;
  quantityByRisk: number;
  quantity: number;
  capitalRequired: number;
  maxLossAmount: number;
  warnings: string[];
};

@Injectable()
export class PositionSizingService {
  constructor(private readonly settingsService: RiskSettingsService) {}

  calculate(
    input: PositionSizeInput,
    settings: RiskSettings = this.settingsService.getSettings(),
  ): PositionSizeResult {
    const entry = input.entry;
    const stopLoss = input.stopLoss;
    const availableCash = Math.max(input.availableCash ?? 0, 0);
    const riskBase = Math.max(input.totalPortfolioValue ?? 0, availableCash);
    const maxCapitalPerTrade = Math.max(
      input.maxCapitalPerTrade ??
        (riskBase * settings.maxActiveSwingCapitalPct) / 100,
      0,
    );
    const maxRiskPerTrade = Math.max(
      input.maxRiskPerTrade ?? (riskBase * settings.maxRiskPerTradePct) / 100,
      0,
    );
    const riskPerShare = roundPrice(entry - stopLoss);
    const capitalLimit = Math.min(availableCash, maxCapitalPerTrade);
    const quantityByCapital = entry > 0 ? Math.floor(capitalLimit / entry) : 0;
    const quantityByRisk =
      riskPerShare > 0 ? Math.floor(maxRiskPerTrade / riskPerShare) : 0;
    const quantity = Math.max(Math.min(quantityByCapital, quantityByRisk), 0);
    const capitalRequired = roundMoney(quantity * entry);
    const maxLossAmount = roundMoney(quantity * Math.max(riskPerShare, 0));
    const warnings: string[] = [];

    if (availableCash <= 0) {
      warnings.push('AVAILABLE_CASH_MISSING_OR_ZERO');
    }

    if (riskPerShare <= 0) {
      warnings.push('INVALID_STOP_LOSS_FOR_BUY');
    }

    if (quantityByCapital < quantityByRisk) {
      warnings.push('CAPITAL_LIMIT_DETERMINED_QUANTITY');
    }

    if (quantityByRisk < quantityByCapital) {
      warnings.push('RISK_LIMIT_DETERMINED_QUANTITY');
    }

    return {
      entry,
      stopLoss,
      availableCash,
      maxCapitalPerTrade: roundMoney(maxCapitalPerTrade),
      maxRiskPerTrade: roundMoney(maxRiskPerTrade),
      riskPerShare,
      quantityByCapital,
      quantityByRisk,
      quantity,
      capitalRequired,
      maxLossAmount,
      warnings,
    };
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPrice(value: number) {
  return Math.round(value * 10000) / 10000;
}
