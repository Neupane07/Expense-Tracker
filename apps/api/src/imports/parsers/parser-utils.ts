import { SourceType } from '../../generated/prisma/enums';
import {
  ParsedStatementRow,
  StatementCell,
  StatementPreviewResult,
  StatementRow,
} from './statement-parser.interface';

export type HeaderMap = {
  date?: number;
  description?: number;
  moneyOut?: number;
  moneyIn?: number;
  amount?: number;
  balance?: number;
  referenceNumber?: number;
};

type RowCandidate = {
  transactionDate: string;
  descriptionRaw: string;
  moneyOut: number;
  moneyIn: number;
  balance: number | null;
  referenceNumber: string | null;
};

export function parseStatementRows(
  sourceType: SourceType,
  rows: StatementRow[],
  headerMapForRow: (row: StatementRow) => HeaderMap,
  candidateForRow: (
    row: StatementRow,
    headerMap?: HeaderMap,
  ) => RowCandidate | null,
): StatementPreviewResult {
  const errors: string[] = [];
  const parsedRows: ParsedStatementRow[] = [];
  const headerIndex = findHeaderIndex(rows, headerMapForRow);
  const headerMap =
    headerIndex === -1 ? undefined : headerMapForRow(rows[headerIndex]);
  const rowsToScan = headerIndex === -1 ? rows : rows.slice(headerIndex + 1);

  rowsToScan.forEach((row, index) => {
    try {
      const candidate = candidateForRow(row, headerMap);

      if (!candidate) {
        return;
      }

      parsedRows.push({
        ...candidate,
        descriptionClean: cleanDescription(candidate.descriptionRaw),
        netAmount: roundMoney(candidate.moneyIn - candidate.moneyOut),
        paymentMethod: inferPaymentMethod(candidate.descriptionRaw),
        sourceType,
      });
    } catch (error) {
      const rowNumber =
        headerIndex === -1 ? index + 1 : headerIndex + index + 2;
      errors.push(
        `Row ${rowNumber}: ${error instanceof Error ? error.message : 'Failed to parse row'}`,
      );
    }
  });

  return {
    rows: parsedRows,
    stats: {
      totalRowsScanned: rows.length,
      parsedRows: parsedRows.length,
      skippedRows: rows.length - parsedRows.length,
      errors,
    },
  };
}

export function buildHeaderMap(
  row: StatementRow,
  aliases: Record<keyof HeaderMap, RegExp[]>,
) {
  const headerMap: HeaderMap = {};

  row.forEach((cell, index) => {
    const value = cellToString(cell).toLowerCase();

    for (const [field, patterns] of Object.entries(aliases) as [
      keyof HeaderMap,
      RegExp[],
    ][]) {
      if (
        !headerMap[field] &&
        patterns.some((pattern) => pattern.test(value))
      ) {
        headerMap[field] = index;
      }
    }
  });

  return headerMap;
}

export function rowHasRequiredHeaderFields(headerMap: HeaderMap) {
  return Boolean(
    headerMap.date !== undefined && headerMap.description !== undefined,
  );
}

export function cellToString(cell: StatementCell) {
  if (cell === null || cell === undefined) {
    return '';
  }

  if (cell instanceof Date) {
    return cell.toISOString();
  }

  return String(cell).trim();
}

export function getCell(row: StatementRow, index?: number) {
  if (index === undefined) {
    return '';
  }

  return cellToString(row[index]);
}

export function firstDateInRow(row: StatementRow) {
  for (const cell of row) {
    const parsedDate = parseStatementDate(cell);

    if (parsedDate) {
      return parsedDate;
    }
  }

  return null;
}

export function parseStatementDate(cell: StatementCell) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    return toIsoDate(cell);
  }

  if (typeof cell === 'number' && cell > 20000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    return toIsoDate(new Date(excelEpoch + cell * 24 * 60 * 60 * 1000));
  }

  const value = cellToString(cell);

  if (!value) {
    return null;
  }

  const numericMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(value);

  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    const year = normalizeYear(Number(numericMatch[3]));
    return validIsoDate(year, month, day);
  }

  const textMatch = /^(\d{1,2})[-\s]([a-z]{3,})[-\s](\d{2,4})$/i.exec(value);

  if (textMatch) {
    const day = Number(textMatch[1]);
    const month = monthNameToNumber(textMatch[2]);
    const year = normalizeYear(Number(textMatch[3]));
    return month ? validIsoDate(year, month, day) : null;
  }

  const parsed = new Date(value);

  if (!Number.isNaN(parsed.getTime())) {
    return toIsoDate(parsed);
  }

  return null;
}

export function parseMoney(value: StatementCell) {
  const text = cellToString(value);

  if (!text || text === '-') {
    return 0;
  }

  const normalized = text
    .replace(/[₹,]/g, '')
    .replace(/\b(inr|rs\.?|dr|cr)\b/gi, '')
    .replace(/[()]/g, '')
    .trim();
  const number = Number(normalized);

  if (Number.isNaN(number)) {
    return 0;
  }

  return roundMoney(Math.abs(number));
}

export function amountHasCreditMarker(value: StatementCell) {
  return /\bcr\b/i.test(cellToString(value));
}

export function amountHasDebitMarker(value: StatementCell) {
  return /\bdr\b/i.test(cellToString(value));
}

export function cleanDescription(description: string) {
  return description.replace(/\s+/g, ' ').trim();
}

export function inferPaymentMethod(description: string) {
  const value = description.toLowerCase();

  if (/\bupi\b/.test(value)) {
    return 'UPI';
  }

  if (/\bimps\b/.test(value)) {
    return 'IMPS';
  }

  if (/\bneft\b/.test(value)) {
    return 'NEFT';
  }

  if (/\binft\b/.test(value)) {
    return 'INFT';
  }

  if (/\batm\b/.test(value)) {
    return 'ATM';
  }

  if (/\b(card|visa|mastercard)\b/.test(value)) {
    return 'CARD';
  }

  return null;
}

export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function findHeaderIndex(
  rows: StatementRow[],
  headerMapForRow: (row: StatementRow) => HeaderMap,
) {
  return rows.findIndex((row) =>
    rowHasRequiredHeaderFields(headerMapForRow(row)),
  );
}

function normalizeYear(year: number) {
  return year < 100 ? 2000 + year : year;
}

function validIsoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return toIsoDate(date);
}

function monthNameToNumber(monthName: string) {
  const months = [
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
  ];
  const monthIndex = months.findIndex((month) =>
    monthName.toLowerCase().startsWith(month),
  );

  return monthIndex === -1 ? null : monthIndex + 1;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
