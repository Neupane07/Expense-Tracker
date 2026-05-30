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
import {
  positionSizeSchema,
  validateTradeSchema,
  type PositionSizeInput,
  type ValidateTradeInput,
} from './risk.dto';
import { RiskService } from './risk.service';

@Controller('risk')
@UseGuards(SessionAuthGuard)
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get()
  getStatus() {
    return this.riskService.getStatus();
  }

  @Post('validate-trade')
  validateTrade(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.riskService.validateTrade(user.id, parseValidateTrade(body));
  }

  @Post('position-size')
  positionSize(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    return this.riskService.positionSize(user.id, parsePositionSize(body));
  }

  @Get('portfolio')
  getPortfolioRisk(@CurrentUser() user: AuthenticatedUser) {
    return this.riskService.getPortfolioRisk(user.id);
  }
}

function parseValidateTrade(body: unknown): ValidateTradeInput {
  const parsed = validateTradeSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid trade validation input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}

function parsePositionSize(body: unknown): PositionSizeInput {
  const parsed = positionSizeSchema.safeParse(body);

  if (!parsed.success) {
    throw new BadRequestException({
      message: 'Invalid position sizing input',
      issues: parsed.error.issues,
    });
  }

  return parsed.data;
}
