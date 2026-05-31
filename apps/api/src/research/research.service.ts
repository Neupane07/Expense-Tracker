import { Injectable } from '@nestjs/common';

@Injectable()
export class ResearchService {
  getStatus() {
    return {
      module: 'research',
      status: 'placeholder',
    };
  }
}
