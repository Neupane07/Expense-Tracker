import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RiskSettings = {
  minRiskReward: number;
  maxActiveSwingTrades: number;
  maxRiskPerTradePct: number;
  maxActiveSwingCapitalPct: number;
  noMtf: boolean;
  noFno: boolean;
  noAutoTrading: boolean;
};

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  minRiskReward: 1.8,
  maxActiveSwingTrades: 2,
  maxRiskPerTradePct: 0.5,
  maxActiveSwingCapitalPct: 20,
  noMtf: true,
  noFno: true,
  noAutoTrading: true,
};

@Injectable()
export class RiskSettingsService {
  constructor(private readonly configService: ConfigService) {}

  getSettings(): RiskSettings {
    return {
      minRiskReward: this.numberSetting(
        'FINANCE_OS_MIN_RISK_REWARD',
        DEFAULT_RISK_SETTINGS.minRiskReward,
      ),
      maxActiveSwingTrades: this.numberSetting(
        'FINANCE_OS_MAX_ACTIVE_SWING_TRADES',
        DEFAULT_RISK_SETTINGS.maxActiveSwingTrades,
      ),
      maxRiskPerTradePct: this.numberSetting(
        'FINANCE_OS_MAX_RISK_PER_TRADE_PCT',
        DEFAULT_RISK_SETTINGS.maxRiskPerTradePct,
      ),
      maxActiveSwingCapitalPct: this.numberSetting(
        'FINANCE_OS_MAX_ACTIVE_SWING_CAPITAL_PCT',
        DEFAULT_RISK_SETTINGS.maxActiveSwingCapitalPct,
      ),
      noMtf: this.booleanSetting(
        'FINANCE_OS_NO_MTF',
        DEFAULT_RISK_SETTINGS.noMtf,
      ),
      noFno: this.booleanSetting(
        'FINANCE_OS_NO_FNO',
        DEFAULT_RISK_SETTINGS.noFno,
      ),
      noAutoTrading: this.booleanSetting(
        'FINANCE_OS_NO_AUTO_TRADING',
        DEFAULT_RISK_SETTINGS.noAutoTrading,
      ),
    };
  }

  private numberSetting(name: string, fallback: number) {
    const raw = this.configService.get<string>(name);

    if (raw == null || raw.trim() === '') {
      return fallback;
    }

    const parsed = Number(raw);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private booleanSetting(name: string, fallback: boolean) {
    const raw = this.configService.get<string>(name);

    if (raw == null || raw.trim() === '') {
      return fallback;
    }

    return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
  }
}
