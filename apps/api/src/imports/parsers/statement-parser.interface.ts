import { SourceType } from '../../generated/prisma/enums';

export type StatementCell = string | number | Date | null;

export type StatementRow = StatementCell[];

export interface ParsedStatementRow {
  transactionDate: string;
  descriptionRaw: string;
  descriptionClean: string;
  moneyOut: number;
  moneyIn: number;
  netAmount: number;
  balance: number | null;
  referenceNumber: string | null;
  paymentMethod: string | null;
  sourceType: SourceType;
}

export interface StatementParsingStats {
  totalRowsScanned: number;
  parsedRows: number;
  skippedRows: number;
  errors: string[];
}

export interface StatementPreviewResult {
  rows: ParsedStatementRow[];
  stats: StatementParsingStats;
}

export interface StatementParser {
  readonly sourceType: SourceType;
  parseRows(rows: StatementRow[]): StatementPreviewResult;
}
