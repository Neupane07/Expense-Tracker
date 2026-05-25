import { Injectable } from '@nestjs/common';
import { SourceType } from '../../generated/prisma/enums';
import {
  amountHasCreditMarker,
  buildHeaderMap,
  cellToString,
  firstDateInRow,
  getCell,
  parseMoney,
  parseStatementDate,
  parseStatementRows,
} from './parser-utils';
import type { HeaderMap } from './parser-utils';
import type {
  StatementParser,
  StatementRow,
} from './statement-parser.interface';

@Injectable()
export class IciciBankParser implements StatementParser {
  readonly sourceType = SourceType.ICICI_BANK;

  parseRows(rows: StatementRow[]) {
    return parseStatementRows(
      this.sourceType,
      rows,
      bankHeaderMapForRow,
      bankCandidateForRow,
    );
  }
}

const bankHeaderAliases: Record<keyof HeaderMap, RegExp[]> = {
  date: [/transaction\s*date/, /\btxn\s*date\b/, /\bdate\b/],
  description: [
    /transaction\s*remarks?/,
    /remarks?/,
    /description/,
    /narration/,
  ],
  moneyOut: [/withdrawal/, /debit/, /\bdr\b/],
  moneyIn: [/deposit/, /credit/, /\bcr\b/],
  amount: [/amount/],
  balance: [/balance/],
  referenceNumber: [/reference/, /\bref\b/, /cheque/],
};

function bankHeaderMapForRow(row: StatementRow) {
  return buildHeaderMap(row, bankHeaderAliases);
}

function bankCandidateForRow(row: StatementRow, headerMap?: HeaderMap) {
  const transactionDate =
    headerMap?.date !== undefined
      ? parseStatementDate(row[headerMap.date])
      : firstDateInRow(row);
  const descriptionRaw = getCell(
    headerMap ? row : rowWithoutLeadingDate(row),
    headerMap?.description,
  );
  const moneyOutFromColumn = parseMoney(row[headerMap?.moneyOut ?? -1]);
  const moneyInFromColumn = parseMoney(row[headerMap?.moneyIn ?? -1]);
  const amount = parseMoney(row[headerMap?.amount ?? -1]);
  const moneyOut =
    moneyOutFromColumn ||
    (amount && !amountHasCreditMarker(row[headerMap?.amount ?? -1])
      ? amount
      : 0);
  const moneyIn =
    moneyInFromColumn ||
    (amount && amountHasCreditMarker(row[headerMap?.amount ?? -1])
      ? amount
      : 0);

  if (!transactionDate || !descriptionRaw || (!moneyOut && !moneyIn)) {
    return null;
  }

  return {
    transactionDate,
    descriptionRaw,
    moneyOut,
    moneyIn,
    balance: parseMoney(row[headerMap?.balance ?? -1]) || null,
    referenceNumber:
      cellToString(row[headerMap?.referenceNumber ?? -1]) || null,
  };
}

function rowWithoutLeadingDate(row: StatementRow) {
  return row.slice(1);
}
