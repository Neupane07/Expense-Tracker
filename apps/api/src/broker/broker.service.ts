import { Injectable } from '@nestjs/common';

@Injectable()
export class BrokerService {
  getStatus() {
    return {
      module: 'broker',
      status: 'placeholder',
    };
  }
}
