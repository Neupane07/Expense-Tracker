export type AmfiNavRow = {
  schemeCode: string;
  schemeName: string;
  nav: number;
  navDate: Date;
  rawPayload: {
    schemeCode: string;
    isinPayout: string;
    isinReinvestment: string;
    schemeName: string;
    nav: string;
    navDate: string;
  };
};

export type MutualFundHoldingForValuation = {
  schemeCode?: string | null;
  schemeName: string;
  units: number;
  avgCostNav?: number | null;
  costValue?: number | null;
};

export type MutualFundNavForValuation = {
  schemeCode: string;
  schemeName: string;
  nav: number;
  navDate: Date;
  source: string;
};

export const AMFI_NAV_STALE_DAYS = 7;

export function parseAmfiNavText(text: string) {
  const rows: AmfiNavRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const columns = line.split(';').map((column) => column.trim());

    if (columns.length < 6 || columns[0] === 'Scheme Code') {
      continue;
    }

    const [schemeCode, isinPayout, isinReinvestment, schemeName, nav, navDate] =
      columns;
    const parsedNav = Number(nav);
    const parsedNavDate = parseAmfiDate(navDate);

    if (
      !schemeCode ||
      !schemeName ||
      !Number.isFinite(parsedNav) ||
      !parsedNavDate
    ) {
      continue;
    }

    rows.push({
      schemeCode,
      schemeName,
      nav: parsedNav,
      navDate: parsedNavDate,
      rawPayload: {
        schemeCode,
        isinPayout,
        isinReinvestment,
        schemeName,
        nav,
        navDate,
      },
    });
  }

  return rows;
}

export function matchAmfiScheme(
  holding: { schemeCode?: string | null; schemeName: string },
  navRows: AmfiNavRow[],
) {
  const manualCode = holding.schemeCode?.trim();

  if (manualCode) {
    return (
      navRows.find((row) => row.schemeCode === manualCode) ??
      navRows.find(
        (row) => row.schemeCode.toLowerCase() === manualCode.toLowerCase(),
      ) ??
      null
    );
  }

  const normalizedHoldingName = normalizeSchemeName(holding.schemeName);
  const exactMatches = navRows.filter(
    (row) => normalizeSchemeName(row.schemeName) === normalizedHoldingName,
  );

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return null;
  }

  const includesMatches = navRows.filter((row) => {
    const normalizedSchemeName = normalizeSchemeName(row.schemeName);
    return (
      normalizedSchemeName.includes(normalizedHoldingName) ||
      normalizedHoldingName.includes(normalizedSchemeName)
    );
  });

  return includesMatches.length === 1 ? includesMatches[0] : null;
}

export function valueMutualFundHolding(
  holding: MutualFundHoldingForValuation,
  nav: MutualFundNavForValuation | null,
  asOf = new Date(),
) {
  const costValue =
    holding.costValue ?? holding.units * (holding.avgCostNav ?? 0);
  const currentValue = nav ? roundMoney(holding.units * nav.nav) : 0;
  const pnl =
    nav && costValue > 0 ? roundMoney(currentValue - costValue) : null;
  const stale = nav ? isNavStale(nav.navDate, asOf) : false;

  return {
    schemeCode: holding.schemeCode ?? nav?.schemeCode ?? null,
    schemeName: holding.schemeName,
    units: holding.units,
    avgCostNav: holding.avgCostNav ?? null,
    costValue: costValue > 0 ? roundMoney(costValue) : null,
    nav: nav?.nav ?? null,
    navDate: nav?.navDate ?? null,
    navSource: nav?.source ?? null,
    currentValue,
    pnl,
    stale,
  };
}

export function buildMutualFundWarnings(
  valuations: Array<ReturnType<typeof valueMutualFundHolding>>,
) {
  const warnings: string[] = [];
  const missingNavs = valuations.filter((valuation) => valuation.nav === null);
  const staleNavs = valuations.filter((valuation) => valuation.stale);

  if (missingNavs.length > 0) {
    warnings.push(
      `${missingNavs.length} mutual fund holding(s) do not have a matched AMFI NAV.`,
    );
  }

  for (const valuation of staleNavs) {
    const navDate = valuation.navDate?.toISOString().slice(0, 10) ?? 'unknown';
    warnings.push(
      `AMFI NAV for ${valuation.schemeName} is stale as of ${navDate}.`,
    );
  }

  return warnings;
}

export function isNavStale(navDate: Date, asOf = new Date()) {
  const navDay = Date.UTC(
    navDate.getUTCFullYear(),
    navDate.getUTCMonth(),
    navDate.getUTCDate(),
  );
  const asOfDay = Date.UTC(
    asOf.getUTCFullYear(),
    asOf.getUTCMonth(),
    asOf.getUTCDate(),
  );
  const ageDays = Math.floor((asOfDay - navDay) / 86_400_000);

  return ageDays > AMFI_NAV_STALE_DAYS;
}

export function normalizeSchemeName(value: string) {
  return value
    .toLowerCase()
    .replace(
      /\b(direct|regular|growth|plan|option|idcw|payout|reinvestment)\b/g,
      ' ',
    )
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseAmfiDate(value: string) {
  const match = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ].indexOf(match[2].toLowerCase());
  const year = Number(match[3]);

  if (month < 0) {
    return null;
  }

  return new Date(Date.UTC(year, month, day));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
