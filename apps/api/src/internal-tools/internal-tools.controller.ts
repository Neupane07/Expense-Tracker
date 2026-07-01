import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ToolAuditService } from './tool-audit.service';
import { ToolExecutorService } from './tool-executor.service';
import { ToolRegistryService } from './tool-registry.service';

const FORBIDDEN_TOOL_NAMES = [
  'place_order',
  'modify_order',
  'cancel_order',
  'auto_trade',
  'trail_stop_loss',
] as const;

@Controller('tools')
@UseGuards(SessionAuthGuard)
export class InternalToolsController {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly executor: ToolExecutorService,
    private readonly audit: ToolAuditService,
  ) {}

  @Get()
  listCatalog() {
    return {
      tools: this.registry.list(),
      forbiddenToolNames: FORBIDDEN_TOOL_NAMES,
      readOnly: true,
    };
  }

  @Get('audits')
  listAudits(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    return this.audit.listForUser(
      user.id,
      Number.isFinite(parsedLimit) ? parsedLimit : 50,
    );
  }

  @Get('audits/:auditId')
  async getAudit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('auditId') auditId: string,
  ) {
    const audit = await this.audit.findForUser(user.id, auditId);

    if (!audit) {
      throw new NotFoundException('Audit record not found');
    }

    return audit;
  }

  @Get(':name')
  describeTool(@Param('name') name: string) {
    this.assertNotForbidden(name);
    return this.registry.describe(name);
  }

  @Post(':name/execute')
  executeTool(
    @CurrentUser() user: AuthenticatedUser,
    @Param('name') name: string,
    @Body() body: unknown,
  ) {
    this.assertNotForbidden(name);
    return this.executor.execute(user, name, body);
  }

  private assertNotForbidden(name: string) {
    if ((FORBIDDEN_TOOL_NAMES as readonly string[]).includes(name)) {
      throw new NotFoundException(`Unknown tool: ${name}`);
    }
  }
}
