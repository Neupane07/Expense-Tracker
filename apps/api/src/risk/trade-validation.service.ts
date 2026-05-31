import { Injectable, NotFoundException } from '@nestjs/common';
import { PricesService } from '../market-data/prices.service';
import { ExposureService } from './exposure.service';
import { PositionSizingService } from './position-sizing.service';
import type { ValidateTradeInput } from './risk.dto';
import { RiskSettingsService } from './risk-settings.service';

type PriceQuality = {
  freshness?: string;
  confidence?: string;
};

export type LatestPriceResponse = {
  instrument?: {
    symbol?: string;
    isActive?: boolean;
    securityId?: string | null;
    instrumentType?: string;
    source?: string;
    dataQuality?: PriceQuality;
    warnings?: string[];
  };
  price?: {
    ltp?: number;
    source?: string;
    timestamp?: Date | string | null;
    freshness?: string;
    dataQuality?: PriceQuality;
    warnings?: string[];
  } | null;
  source?: string;
  timestamp?: Date | string | null;
  dataQuality?: PriceQuality;
  warnings?: string[];
};

export type ValidateTradeOptions = {
  marketData?: LatestPriceResponse | null;
};

export type TradeValidationResult = {
  valid: boolean;
  symbol: string;
  entry: number;
  target: number;
  stopLoss: number;
  quantity: number;
  capitalRequired: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskReward: number;
  maxLossAmount: number;
  targetProfitAmount: number;
  portfolioExposureBefore: {
    amount: number;
    percent: number;
  };
  portfolioExposureAfter: {
    amount: number;
    percent: number;
  };
  warnings: string[];
  rejectReasons: string[];
  dataQuality: {
    source: string | null;
    asOf: Date | string | null;
    freshness: string;
    confidence: string;
    warnings: string[];
  };
};

@Injectable()
export class TradeValidationService {
  constructor(
    private readonly pricesService: PricesService,
    private readonly exposureService: ExposureService,
    private readonly positionSizingService: PositionSizingService,
    private readonly settingsService: RiskSettingsService,
  ) {}

  async validateTrade(
    userId: string,
    input: ValidateTradeInput,
    options?: ValidateTradeOptions,
  ): Promise<TradeValidationResult> {
    const symbol = input.symbol.trim().toUpperCase();
    const side = input.side.trim().toUpperCase();
    const product = input.product.trim().toUpperCase();
    const settings = this.settingsService.getSettings();
    const warnings: string[] = [];
    const rejectReasons: string[] = [];
    const portfolio = await this.exposureService.getPortfolioRisk(userId);
    const marketData: LatestPriceResponse | null =
      options?.marketData !== undefined
        ? options.marketData
        : await this.loadMarketData(userId, symbol, rejectReasons);
    const quantity = this.resolveQuantity(input, portfolio);
    const riskPerShare = roundPrice(input.entry - input.stopLoss);
    const rewardPerShare = roundPrice(input.target - input.entry);
    const riskReward =
      riskPerShare > 0 ? roundRatio(rewardPerShare / riskPerShare) : 0;
    const capitalRequired = roundMoney(quantity * Math.max(input.entry, 0));
    const maxLossAmount = roundMoney(quantity * Math.max(riskPerShare, 0));
    const targetProfitAmount = roundMoney(
      quantity * Math.max(rewardPerShare, 0),
    );
    const tradeExposure = await this.exposureService.getTradeExposure(
      userId,
      symbol,
      capitalRequired,
    );
    const dataQuality = this.buildDataQuality(marketData);

    if (side !== 'BUY') {
      rejectReasons.push('ONLY_BUY_SIDE_SUPPORTED');
    }

    if (product !== 'DELIVERY') {
      rejectReasons.push('PRODUCT_NOT_DELIVERY');
    }

    if (settings.noMtf && (input.mtf || product.includes('MTF'))) {
      rejectReasons.push('MTF_NOT_ALLOWED');
    }

    if (
      settings.noFno &&
      (input.fno ||
        product.includes('FNO') ||
        product.includes('F&O') ||
        marketData?.instrument?.instrumentType === 'FUTURES' ||
        marketData?.instrument?.instrumentType === 'OPTIONS')
    ) {
      rejectReasons.push('FNO_NOT_ALLOWED');
    }

    if (input.entry <= 0) {
      rejectReasons.push('ENTRY_MUST_BE_POSITIVE');
    }

    if (side === 'BUY' && input.target <= input.entry) {
      rejectReasons.push('TARGET_MUST_BE_ABOVE_ENTRY_FOR_BUY');
    }

    if (side === 'BUY' && input.stopLoss >= input.entry) {
      rejectReasons.push('STOP_LOSS_MUST_BE_BELOW_ENTRY_FOR_BUY');
    }

    if (riskReward < settings.minRiskReward) {
      rejectReasons.push('RISK_REWARD_BELOW_MINIMUM');
    }

    if (quantity <= 0) {
      rejectReasons.push('QUANTITY_MUST_BE_POSITIVE');
    }

    if (capitalRequired > portfolio.cash) {
      rejectReasons.push('CAPITAL_REQUIRED_EXCEEDS_AVAILABLE_CASH');
    }

    const riskBase = Math.max(portfolio.totalPortfolioValue, portfolio.cash);
    const maxRiskAmount = roundMoney(
      (riskBase * settings.maxRiskPerTradePct) / 100,
    );

    if (maxLossAmount > maxRiskAmount) {
      rejectReasons.push('MAX_LOSS_EXCEEDS_RISK_PER_TRADE');
    }

    const activeSwingCapitalAfter =
      portfolio.activeSwingCapital + capitalRequired;
    const maxActiveSwingCapital = roundMoney(
      (riskBase * settings.maxActiveSwingCapitalPct) / 100,
    );

    if (activeSwingCapitalAfter > maxActiveSwingCapital) {
      rejectReasons.push('ACTIVE_SWING_CAPITAL_LIMIT_EXCEEDED');
    }

    if (portfolio.activeSwingTradeCount >= settings.maxActiveSwingTrades) {
      rejectReasons.push('MAX_ACTIVE_SWING_TRADES_REACHED');
    }

    if (!marketData?.instrument) {
      rejectReasons.push('UNKNOWN_SYMBOL');
    } else if (
      !marketData.instrument.isActive ||
      !marketData.instrument.securityId
    ) {
      rejectReasons.push('SYMBOL_NOT_VERIFIED');
    }

    if (!marketData?.price || dataQuality.freshness === 'MISSING') {
      rejectReasons.push('PRICE_MISSING');
    }

    if (dataQuality.freshness === 'STALE') {
      rejectReasons.push('PRICE_STALE');
    }

    if (tradeExposure.alreadyHeld) {
      warnings.push('SYMBOL_ALREADY_HELD');
    }

    if (tradeExposure.afterPct > tradeExposure.beforePct) {
      warnings.push('TRADE_INCREASES_CONCENTRATION');
    }

    if (tradeExposure.afterPct > 10) {
      warnings.push('SINGLE_STOCK_CONCENTRATION_ABOVE_10_PERCENT');
    }

    if (isFallbackOrUnofficial(dataQuality.source)) {
      warnings.push('DATA_SOURCE_FALLBACK_OR_UNOFFICIAL');
    }

    warnings.push(...dataQuality.warnings);

    return {
      valid: rejectReasons.length === 0,
      symbol,
      entry: input.entry,
      target: input.target,
      stopLoss: input.stopLoss,
      quantity,
      capitalRequired,
      riskPerShare,
      rewardPerShare,
      riskReward,
      maxLossAmount,
      targetProfitAmount,
      portfolioExposureBefore: {
        amount: tradeExposure.beforeAmount,
        percent: tradeExposure.beforePct,
      },
      portfolioExposureAfter: {
        amount: tradeExposure.afterAmount,
        percent: tradeExposure.afterPct,
      },
      warnings: unique(warnings),
      rejectReasons: unique(rejectReasons),
      dataQuality,
    };
  }

  private resolveQuantity(
    input: ValidateTradeInput,
    portfolio: { cash: number; totalPortfolioValue: number },
  ) {
    if (input.quantity != null) {
      return Math.floor(input.quantity);
    }

    if (input.capital != null && input.entry > 0) {
      return Math.floor(input.capital / input.entry);
    }

    const sizing = this.positionSizingService.calculate({
      entry: input.entry,
      stopLoss: input.stopLoss,
      availableCash: portfolio.cash,
      totalPortfolioValue: portfolio.totalPortfolioValue,
    });

    return sizing.quantity;
  }

  private async loadMarketData(
    userId: string,
    symbol: string,
    rejectReasons: string[],
  ) {
    try {
      return (await this.pricesService.getLatest(
        userId,
        symbol,
      )) as LatestPriceResponse;
    } catch (error) {
      if (error instanceof NotFoundException) {
        return null;
      }

      rejectReasons.push('MARKET_DATA_UNAVAILABLE');
      return null;
    }
  }

  private buildDataQuality(marketData: LatestPriceResponse | null) {
    const priceWarnings = marketData?.price?.warnings ?? [];
    const responseWarnings = marketData?.warnings ?? [];
    const dataQuality = marketData?.price?.dataQuality ??
      marketData?.dataQuality ?? {
        freshness: 'MISSING',
        confidence: 'LOW',
      };

    return {
      source: marketData?.price?.source ?? marketData?.source ?? null,
      asOf: marketData?.price?.timestamp ?? marketData?.timestamp ?? null,
      freshness: dataQuality.freshness ?? 'MISSING',
      confidence: dataQuality.confidence ?? 'LOW',
      warnings: unique([...responseWarnings, ...priceWarnings]),
    };
  }
}

function isFallbackOrUnofficial(source: string | null | undefined) {
  const normalized = source?.toUpperCase() ?? '';

  return (
    normalized.includes('FALLBACK') ||
    normalized.includes('UNOFFICIAL') ||
    normalized.includes('YAHOO') ||
    normalized.includes('MANUAL')
  );
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function roundPrice(value: number) {
  return Math.round(value * 10000) / 10000;
}

function roundRatio(value: number) {
  return Math.round(value * 10000) / 10000;
}
