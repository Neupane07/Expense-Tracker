import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { runSwingScanSchema, type RunSwingScanInput } from './scanner.dto';
import { ScannerService } from './scanner.service';
import { SwingScannerService } from './swing-scanner.service';

@Controller('scanner')
@UseGuards(SessionAuthGuard)
export class SwingScannerController {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly swingScanner: SwingScannerService,
  ) {}

  @Get()
  getStatus() {
    return this.scannerService.getStatus();
  }

  @Post('swing/run')
  runSwingScan(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.swingScanner.runScan(user.id, parseRunSwingScan(body));
  }

  @Get('swing/candidates')
  getSwingCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.swingScanner.getLatestCandidates(user.id);
  }
}

function parseRunSwingScan(body: unknown): RunSwingScanInput {
  const parsed = runSwingScanSchema.safeParse(body ?? {});

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid swing scan input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}
