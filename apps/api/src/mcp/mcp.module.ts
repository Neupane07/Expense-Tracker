import { Module } from '@nestjs/common';
import { InternalToolsModule } from '../internal-tools/internal-tools.module';
import { McpAuthService } from './mcp-auth.service';
import { McpController } from './mcp.controller';
import { McpHealthController } from './mcp-health.controller';
import { McpRateLimitService } from './mcp-rate-limit.service';
import { McpRuntimeService } from './mcp-runtime.service';
import { McpToolBridgeService } from './mcp-tool-bridge.service';

@Module({
  imports: [InternalToolsModule],
  controllers: [McpController, McpHealthController],
  providers: [
    McpAuthService,
    McpRateLimitService,
    McpToolBridgeService,
    McpRuntimeService,
  ],
  exports: [McpAuthService, McpToolBridgeService, McpRuntimeService],
})
export class McpModule {}
