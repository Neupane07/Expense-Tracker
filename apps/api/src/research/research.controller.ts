import { Controller, Get, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ResearchService } from './research.service';

@Controller('research')
@UseGuards(SessionAuthGuard)
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  @Get()
  getStatus() {
    return this.researchService.getStatus();
  }
}
