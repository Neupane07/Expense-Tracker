import { Injectable } from '@nestjs/common';

@Injectable()
export class TradeJournalService {
  getStatus() {
    return {
      module: 'trade-journal',
      status: 'placeholder',
    };
  }
}
