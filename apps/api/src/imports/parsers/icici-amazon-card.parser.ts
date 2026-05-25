import { Injectable } from '@nestjs/common';
import { SourceType } from '../../generated/prisma/enums';
import {
  amountHasCreditMarker,
  amountHasDebitMarker,
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
export class IciciAmazonCardParser implements StatementParser {
  readonly sourceType = SourceType.ICICI_AMAZON_PAY_CARD;

  parseRows(rows: StatementRow[]) {
    return parseStatementRows(
      this.sourceType,
      rows,
      cardHeaderMapForRow,
      cardCandidateForRow,
    );
  }
}

const cardHeaderAliases: Record<keyof HeaderMap, RegExp[]> = {
  date: [/transaction\s*date/, /\bdate\b/],
  description: [/details?/, /description/, /merchant/, /transaction/],
  moneyOut: [/debit/, /\bdr\b/],
  moneyIn: [/credit/, /\bcr\b/],
  amount: [/amount/],
  balance: [/balance/],
  referenceNumber: [/reference/, /\bref\b/, /approval/],
};

function cardHeaderMapForRow(row: StatementRow) {
  return buildHeaderMap(row, cardHeaderAliases);
}

function cardCandidateForRow(row: StatementRow, headerMap?: HeaderMap) {
  const transactionDate =
    headerMap?.date !== undefined
      ? parseStatementDate(row[headerMap.date])
      : firstDateInRow(row);
  const descriptionRaw = getCell(row, headerMap?.description);
  const amountCell = row[headerMap?.amount ?? -1];
  const amount = parseMoney(amountCell);
  const moneyOutFromColumn = parseMoney(row[headerMap?.moneyOut ?? -1]);
  const moneyInFromColumn = parseMoney(row[headerMap?.moneyIn ?? -1]);
  const moneyIn =
    moneyInFromColumn ||
    (amount && amountHasCreditMarker(amountCell) ? amount : 0);
  const moneyOut =
    moneyOutFromColumn ||
    (amount && (amountHasDebitMarker(amountCell) || !moneyIn) ? amount : 0);

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
