import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { parseScannerReadinessQuery } from './scanner-readiness.dto';
import { ScannerReadinessService } from './scanner-readiness.service';
import { runSwingScanSchema, type RunSwingScanInput } from './scanner.dto';
import { ScannerService } from './scanner.service';
import { SwingScannerService } from './swing-scanner.service';

@Controller('scanner')
@UseGuards(SessionAuthGuard)
export class SwingScannerController {
  constructor(
    private readonly scannerService: ScannerService,
    private readonly swingScanner: SwingScannerService,
    private readonly readiness: ScannerReadinessService,
  ) {}

  @Get()
  getStatus() {
    return this.scannerService.getStatus();
  }

  @Get('readiness')
  getReadiness(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.readiness.getReadiness(user.id, parseScannerReadinessQuery(query));
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
