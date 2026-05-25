import { Injectable } from '@nestjs/common';
import { SourceType } from '../../generated/prisma/client';
import {
  ParsedStatementRow,
  StatementParser,
} from './statement-parser.interface';

@Injectable()
export class IciciAmazonCardParser implements StatementParser {
  readonly sourceType = SourceType.ICICI_AMAZON_PAY_CARD;

  parse(): Promise<ParsedStatementRow[]> {
    throw new Error(
      'ICICI Amazon Pay card statement parsing is not implemented yet.',
    );
  }
}
