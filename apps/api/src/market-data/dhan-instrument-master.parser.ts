import { createHash } from 'node:crypto';
import {
  DHAN_SCRIP_MASTER_SOURCE,
  EQUITY_EXCHANGES,
  EQUITY_SEGMENTS,
} from './instrument-master.constants';

export type DhanInstrumentMasterRow = {
  exchange: string;
  segment: string;
  securityId: string;
  isin: string | null;
  instrumentName: string;
  symbol: string;
  displayName: string;
  instrumentType: string;
  series: string | null;
  buySellIndicator: string | null;
  source: string;
  sourceRowHash: string;
  rawMetadata: Record<string, string>;
};

const DETAILED_COLUMNS = [
  'EXCH_ID',
  'SEGMENT',
  'SECURITY_ID',
  'ISIN',
  'INSTRUMENT',
  'UNDERLYING_SECURITY_ID',
  'UNDERLYING_SYMBOL',
  'SYMBOL_NAME',
  'DISPLAY_NAME',
  'INSTRUMENT_TYPE',
  'SERIES',
  'LOT_SIZE',
  'SM_EXPIRY_DATE',
  'STRIKE_PRICE',
  'OPTION_TYPE',
  'TICK_SIZE',
  'EXPIRY_FLAG',
  'BRACKET_FLAG',
  'COVER_FLAG',
  'ASM_GSM_FLAG',
  'ASM_GSM_CATEGORY',
  'BUY_SELL_INDICATOR',
] as const;

export function hashInstrumentMasterContent(content: string) {
  return createHash('sha256').update(content).digest('hex');
}

export function parseDhanInstrumentMasterCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      rows: [] as DhanInstrumentMasterRow[],
      contentHash: hashInstrumentMasterContent(text),
      headerColumns: [] as string[],
    };
  }

  const headerColumns = parseCsvLine(lines[0]);
  const rows: DhanInstrumentMasterRow[] = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const record = toRecord(headerColumns, values);
    const parsed = parseDetailedRow(record);

    if (parsed) {
      rows.push(parsed);
    }
  }

  return {
    rows,
    contentHash: hashInstrumentMasterContent(text),
    headerColumns,
  };
}

function parseDetailedRow(
  record: Record<string, string>,
): DhanInstrumentMasterRow | null {
  const exchange = normalizeToken(record.EXCH_ID);
  const segment = normalizeToken(record.SEGMENT);
  const instrumentName = normalizeToken(record.INSTRUMENT);
  const securityId = normalizeToken(record.SECURITY_ID);
  const underlyingSymbol = normalizeToken(record.UNDERLYING_SYMBOL);
  const symbolName = normalizeToken(record.SYMBOL_NAME);
  const symbol = underlyingSymbol || symbolName;

  if (
    !EQUITY_EXCHANGES.has(exchange) ||
    !EQUITY_SEGMENTS.has(segment) ||
    instrumentName !== 'EQUITY' ||
    !securityId ||
    !symbol
  ) {
    return null;
  }

  const isin = normalizeIsin(record.ISIN);
  const rawMetadata = DETAILED_COLUMNS.reduce<Record<string, string>>(
    (accumulator, column) => {
      accumulator[column] = record[column] ?? '';
      return accumulator;
    },
    {},
  );

  const sourceRowHash = createHash('sha256')
    .update(
      [
        exchange,
        securityId,
        symbol,
        isin ?? '',
        instrumentName,
        record.INSTRUMENT_TYPE ?? '',
        record.SERIES ?? '',
        record.BUY_SELL_INDICATOR ?? '',
      ].join('|'),
    )
    .digest('hex');

  return {
    exchange,
    segment,
    securityId,
    isin,
    instrumentName,
    symbol,
    displayName: record.DISPLAY_NAME?.trim() || symbolName || symbol,
    instrumentType: normalizeToken(record.INSTRUMENT_TYPE) || 'UNKNOWN',
    series: normalizeOptionalToken(record.SERIES),
    buySellIndicator: normalizeOptionalToken(record.BUY_SELL_INDICATOR),
    source: DHAN_SCRIP_MASTER_SOURCE,
    sourceRowHash,
    rawMetadata,
  };
}

function toRecord(columns: string[], values: string[]) {
  const record: Record<string, string> = {};

  for (let index = 0; index < columns.length; index += 1) {
    record[columns[index]] = values[index] ?? '';
  }

  return record;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function normalizeToken(value: string | undefined) {
  return value?.trim().toUpperCase() ?? '';
}

function normalizeOptionalToken(value: string | undefined) {
  const normalized = value?.trim().toUpperCase() ?? '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeIsin(value: string | undefined) {
  const normalized = value?.trim().toUpperCase() ?? '';

  if (!normalized || normalized === 'NA') {
    return null;
  }

  return normalized;
}
