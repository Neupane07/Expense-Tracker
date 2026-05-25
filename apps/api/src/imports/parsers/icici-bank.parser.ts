import { Injectable } from '@nestjs/common';
import { SourceType } from '../../generated/prisma/client';
import {
  ParsedStatementRow,
  StatementParser,
} from './statement-parser.interface';

@Injectable()
export class IciciBankParser implements StatementParser {
  readonly sourceType = SourceType.ICICI_BANK;

  parse(): Promise<ParsedStatementRow[]> {
    throw new Error('ICICI bank statement parsing is not implemented yet.');
  }
}
