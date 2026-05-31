import {
  buildMutualFundWarnings,
  matchAmfiScheme,
  parseAmfiNavText,
  valueMutualFundHolding,
} from './amfi-nav';

const amfiText = [
  'Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Net Asset Value;Date',
  '120503;INF209K01UN8;;Axis Bluechip Fund - Direct Plan - Growth;55.1234;28-May-2026',
  '118834;INF179K01XQ0;;HDFC Flexi Cap Fund - Direct Plan - Growth Option;177.25;20-May-2026',
].join('\n');

describe('AMFI NAV matching and valuation', () => {
  it('matches holdings by normalized scheme name', () => {
    const rows = parseAmfiNavText(amfiText);

    expect(
      matchAmfiScheme({ schemeName: 'Axis Bluechip Fund Direct Growth' }, rows)
        ?.schemeCode,
    ).toBe('120503');
  });

  it('uses manual schemeCode override before name matching', () => {
    const rows = parseAmfiNavText(amfiText);

    expect(
      matchAmfiScheme(
        {
          schemeCode: '118834',
          schemeName: 'Axis Bluechip Fund Direct Growth',
        },
        rows,
      )?.schemeName,
    ).toBe('HDFC Flexi Cap Fund - Direct Plan - Growth Option');
  });

  it('calculates mutual fund value and P&L from latest NAV', () => {
    const valuation = valueMutualFundHolding(
      {
        schemeCode: '120503',
        schemeName: 'Axis Bluechip Fund Direct Growth',
        units: 10,
        costValue: 400,
      },
      {
        schemeCode: '120503',
        schemeName: 'Axis Bluechip Fund - Direct Plan - Growth',
        nav: 55.1234,
        navDate: new Date('2026-05-28T00:00:00.000Z'),
        source: 'AMFI',
      },
      new Date('2026-05-29T00:00:00.000Z'),
    );

    expect(valuation).toEqual(
      expect.objectContaining({
        currentValue: 551.23,
        pnl: 151.23,
        stale: false,
      }),
    );
  });

  it('reports stale NAV warnings', () => {
    const valuation = valueMutualFundHolding(
      {
        schemeCode: '118834',
        schemeName: 'HDFC Flexi Cap Fund Direct Growth',
        units: 5,
      },
      {
        schemeCode: '118834',
        schemeName: 'HDFC Flexi Cap Fund - Direct Plan - Growth Option',
        nav: 177.25,
        navDate: new Date('2026-05-20T00:00:00.000Z'),
        source: 'AMFI',
      },
      new Date('2026-05-29T00:00:00.000Z'),
    );

    expect(valuation.stale).toBe(true);
    expect(buildMutualFundWarnings([valuation])).toEqual([
      'AMFI NAV for HDFC Flexi Cap Fund Direct Growth is stale as of 2026-05-20.',
    ]);
  });
});
