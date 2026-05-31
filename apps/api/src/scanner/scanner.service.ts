import { Injectable } from '@nestjs/common';

@Injectable()
export class ScannerService {
  getStatus() {
    return {
      module: 'scanner',
      status: 'swing-foundation',
      automation: 'disabled',
      orderPlacement: false,
    };
  }
}
