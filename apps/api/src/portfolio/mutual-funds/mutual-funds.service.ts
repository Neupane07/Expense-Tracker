import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildMutualFundWarnings,
  matchAmfiScheme,
  parseAmfiNavText,
  valueMutualFundHolding,
} from './amfi-nav';

type DecimalLike = {
  toNumber(): number;
};

export type CreateMutualFundHoldingInput = {
  schemeName?: string;
  schemeCode?: string | null;
  folioLastFour?: string | null;
  units?: number | string;
  avgCostNav?: number | string | null;
  costValue?: number | string | null;
};

export type UpdateMutualFundHoldingInput =
  Partial<CreateMutualFundHoldingInput>;

const decimalInput = z.union([z.number(), z.string().trim().min(1)]);

const createHoldingSchema = z.object({
  schemeName: z.string().trim().min(1, 'schemeName is required').max(240),
  schemeCode: z.string().trim().max(32).optional().nullable(),
  folioLastFour: z.string().trim().max(16).optional().nullable(),
  units: decimalInput,
  avgCostNav: decimalInput.optional().nullable(),
  costValue: decimalInput.optional().nullable(),
});

const updateHoldingSchema = createHoldingSchema.partial();

@Injectable()
export class MutualFundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async findAll(userId: string) {
    return this.getValuations(userId);
  }

  async create(userId: string, input: CreateMutualFundHoldingInput) {
    const data = this.parseCreate(input);

    const holding = await this.prisma.mutualFundHolding.create({
      data: {
        userId,
        ...data,
        rawPayload: this.toJson(input),
      },
    });

    return this.serializeHolding(holding);
  }

  async update(
    userId: string,
    holdingId: string,
    input: UpdateMutualFundHoldingInput,
  ) {
    await this.assertOwnedHolding(userId, holdingId);
    const data = this.parseUpdate(input);

    const holding = await this.prisma.mutualFundHolding.update({
      where: { id: holdingId },
      data: {
        ...data,
        rawPayload: this.toJson(input),
      },
    });

    return this.serializeHolding(holding);
  }

  async remove(userId: string, holdingId: string) {
    await this.assertOwnedHolding(userId, holdingId);
    await this.prisma.mutualFundHolding.delete({ where: { id: holdingId } });

    return { deleted: true };
  }

  async syncAmfiNav(userId: string) {
    const text = await this.fetchAmfiNavText();
    const navRows = parseAmfiNavText(text);
    const holdings = await this.prisma.mutualFundHolding.findMany({
      where: { userId },
      orderBy: { schemeName: 'asc' },
    });
    let matched = 0;
    let unmatched = 0;
    let navsUpserted = 0;

    for (const holding of holdings) {
      const match = matchAmfiScheme(
        {
          schemeCode: holding.schemeCode,
          schemeName: holding.schemeName,
        },
        navRows,
      );

      if (!match) {
        unmatched += 1;
        continue;
      }

      matched += 1;
      await this.prisma.mutualFundNav.upsert({
        where: {
          userId_schemeCode_navDate: {
            userId,
            schemeCode: match.schemeCode,
            navDate: match.navDate,
          },
        },
        create: {
          userId,
          schemeCode: match.schemeCode,
          schemeName: match.schemeName,
          nav: match.nav,
          navDate: match.navDate,
          source: 'AMFI',
          rawPayload: this.toJson(match.rawPayload),
        },
        update: {
          schemeName: match.schemeName,
          nav: match.nav,
          source: 'AMFI',
          rawPayload: this.toJson(match.rawPayload),
        },
      });
      navsUpserted += 1;

      if (!holding.schemeCode) {
        await this.prisma.mutualFundHolding.update({
          where: { id: holding.id },
          data: { schemeCode: match.schemeCode },
        });
      }
    }

    return {
      source: 'AMFI',
      totalSchemes: navRows.length,
      holdingCount: holdings.length,
      matched,
      unmatched,
      navsUpserted,
    };
  }

  async getValuations(userId: string, asOf = new Date()) {
    const holdings = await this.prisma.mutualFundHolding.findMany({
      where: { userId },
      orderBy: { schemeName: 'asc' },
    });
    const schemeCodes = holdings
      .map((holding) => holding.schemeCode)
      .filter((schemeCode): schemeCode is string => Boolean(schemeCode));
    const navs =
      schemeCodes.length > 0
        ? await this.prisma.mutualFundNav.findMany({
            where: {
              userId,
              schemeCode: {
                in: schemeCodes,
              },
            },
            orderBy: { navDate: 'desc' },
          })
        : [];
    const latestNavBySchemeCode = new Map<string, (typeof navs)[number]>();

    for (const nav of navs) {
      if (!latestNavBySchemeCode.has(nav.schemeCode)) {
        latestNavBySchemeCode.set(nav.schemeCode, nav);
      }
    }

    const valuations = holdings.map((holding) => {
      const nav = holding.schemeCode
        ? latestNavBySchemeCode.get(holding.schemeCode)
        : null;

      return {
        id: holding.id,
        folioLastFour: holding.folioLastFour,
        ...valueMutualFundHolding(
          {
            schemeCode: holding.schemeCode,
            schemeName: holding.schemeName,
            units: this.decimalToNumber(holding.units),
            avgCostNav: this.decimalToNumberOrNull(holding.avgCostNav),
            costValue: this.decimalToNumberOrNull(holding.costValue),
          },
          nav
            ? {
                schemeCode: nav.schemeCode,
                schemeName: nav.schemeName,
                nav: this.decimalToNumber(nav.nav),
                navDate: nav.navDate,
                source: nav.source,
              }
            : null,
          asOf,
        ),
      };
    });

    const totalCurrentValue = valuations.reduce(
      (total, valuation) => total + valuation.currentValue,
      0,
    );
    const totalInvested = valuations.reduce(
      (total, valuation) => total + (valuation.costValue ?? 0),
      0,
    );
    const totalPnl = valuations.reduce(
      (total, valuation) => total + (valuation.pnl ?? 0),
      0,
    );
    const totalPnlPercent =
      totalInvested > 0
        ? Math.round((totalPnl / totalInvested) * 10000) / 100
        : null;

    return {
      asOf,
      holdings: valuations,
      totalValue: roundMoney(totalCurrentValue),
      totalInvested: roundMoney(totalInvested),
      totalPnl: roundMoney(totalPnl),
      totalPnlPercent,
      warnings: buildMutualFundWarnings(valuations),
    };
  }

  private async fetchAmfiNavText() {
    const url =
      this.configService.get<string>('AMFI_NAV_URL')?.trim() ||
      'https://portal.amfiindia.com/spages/NAVAll.txt';

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'text/plain,*/*',
          'User-Agent': 'FinanceOS/1.0',
        },
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unknown network error';
      throw new BadRequestException(
        `AMFI NAV sync failed: unable to reach AMFI (${detail}). ` +
          'Check outbound HTTPS from the API container and AMFI_NAV_URL.',
      );
    }

    if (!response.ok) {
      throw new BadRequestException(
        `AMFI NAV sync failed with ${response.status}`,
      );
    }

    return response.text();
  }

  private async assertOwnedHolding(userId: string, holdingId: string) {
    const holding = await this.prisma.mutualFundHolding.findFirst({
      where: { id: holdingId, userId },
    });

    if (!holding) {
      throw new NotFoundException('Mutual fund holding not found');
    }
  }

  private parseCreate(input: CreateMutualFundHoldingInput) {
    const result = createHoldingSchema.safeParse(input);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }

    return {
      schemeName: result.data.schemeName,
      schemeCode: result.data.schemeCode || null,
      folioLastFour: result.data.folioLastFour || null,
      units: this.parseDecimal(result.data.units, 'units'),
      avgCostNav:
        result.data.avgCostNav === undefined || result.data.avgCostNav === null
          ? null
          : this.parseDecimal(result.data.avgCostNav, 'avgCostNav'),
      costValue:
        result.data.costValue === undefined || result.data.costValue === null
          ? null
          : this.parseDecimal(result.data.costValue, 'costValue'),
    };
  }

  private parseUpdate(input: UpdateMutualFundHoldingInput) {
    const result = updateHoldingSchema.safeParse(input);

    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => issue.message),
      );
    }

    return {
      ...(result.data.schemeName !== undefined
        ? { schemeName: result.data.schemeName }
        : {}),
      ...(result.data.schemeCode !== undefined
        ? { schemeCode: result.data.schemeCode || null }
        : {}),
      ...(result.data.folioLastFour !== undefined
        ? { folioLastFour: result.data.folioLastFour || null }
        : {}),
      ...(result.data.units !== undefined
        ? { units: this.parseDecimal(result.data.units, 'units') }
        : {}),
      ...(result.data.avgCostNav !== undefined
        ? {
            avgCostNav:
              result.data.avgCostNav === null
                ? null
                : this.parseDecimal(result.data.avgCostNav, 'avgCostNav'),
          }
        : {}),
      ...(result.data.costValue !== undefined
        ? {
            costValue:
              result.data.costValue === null
                ? null
                : this.parseDecimal(result.data.costValue, 'costValue'),
          }
        : {}),
    };
  }

  private parseDecimal(value: number | string, field: string) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new BadRequestException(`${field} must be a non-negative number`);
    }

    return parsed;
  }

  private serializeHolding(holding: {
    id: string;
    schemeCode: string | null;
    schemeName: string;
    folioLastFour: string | null;
    units: DecimalLike;
    avgCostNav: DecimalLike | null;
    costValue: DecimalLike | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: holding.id,
      schemeCode: holding.schemeCode,
      schemeName: holding.schemeName,
      folioLastFour: holding.folioLastFour,
      units: this.decimalToNumber(holding.units),
      avgCostNav: this.decimalToNumberOrNull(holding.avgCostNav),
      costValue: this.decimalToNumberOrNull(holding.costValue),
      createdAt: holding.createdAt,
      updatedAt: holding.updatedAt,
    };
  }

  private decimalToNumber(value: DecimalLike | number) {
    if (typeof value === 'number') {
      return value;
    }

    return value.toNumber();
  }

  private decimalToNumberOrNull(value: DecimalLike | number | null) {
    if (value === null) {
      return null;
    }

    return this.decimalToNumber(value);
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
