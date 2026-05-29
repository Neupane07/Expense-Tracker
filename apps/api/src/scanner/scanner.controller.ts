import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ScannerService } from './scanner.service';

@Controller('scanner')
@UseGuards(SessionAuthGuard)
export class ScannerController {
  constructor(private readonly scannerService: ScannerService) {}

  @Get()
  getStatus() {
    return this.scannerService.getStatus();
  }
}
