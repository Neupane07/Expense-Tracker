import { SourceType } from '../../generated/prisma/client';

export interface ParsedStatementRow {
  transactionDate: Date;
  rawDescription: string;
  moneyOut: number;
  moneyIn: number;
  balance?: number;
  referenceNumber?: string;
  rawRowJson: Record<string, unknown>;
}

export interface StatementParser {
  readonly sourceType: SourceType;
  parse(input: Buffer): Promise<ParsedStatementRow[]>;
}
