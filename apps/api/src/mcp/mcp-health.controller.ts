import { Controller, Get } from '@nestjs/common';
import { McpRuntimeService } from './mcp-runtime.service';

@Controller('health/mcp')
export class McpHealthController {
  constructor(private readonly runtime: McpRuntimeService) {}

  @Get()
  getMcpHealth() {
    return {
      ...this.runtime.getReadiness(),
      timestamp: new Date().toISOString(),
    };
  }
}
