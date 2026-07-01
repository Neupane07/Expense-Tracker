import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ToolExecutorService } from '../internal-tools/tool-executor.service';
import { ToolRegistryService } from '../internal-tools/tool-registry.service';
import type { ToolEnvelope } from '../internal-tools/tool.types';
import {
  MCP_ALLOWED_TOOL_NAMES,
  MCP_FORBIDDEN_TOOL_NAMES,
  type McpAllowedToolName,
} from './mcp.constants';

@Injectable()
export class McpToolBridgeService {
  constructor(
    private readonly registry: ToolRegistryService,
    private readonly executor: ToolExecutorService,
  ) {}

  listExposedTools() {
    const allowed = new Set<string>(MCP_ALLOWED_TOOL_NAMES);

    return this.registry.list().filter((tool) => allowed.has(tool.name));
  }

  assertToolAllowed(toolName: string): asserts toolName is McpAllowedToolName {
    if ((MCP_FORBIDDEN_TOOL_NAMES as readonly string[]).includes(toolName)) {
      throw new NotFoundException(`Unknown tool: ${toolName}`);
    }

    if (!(MCP_ALLOWED_TOOL_NAMES as readonly string[]).includes(toolName)) {
      throw new ForbiddenException(
        `Tool is not exposed through MCP: ${toolName}`,
      );
    }
  }

  async executeTool(
    user: AuthenticatedUser,
    toolName: string,
    input: unknown,
  ): Promise<ToolEnvelope> {
    this.assertToolAllowed(toolName);
    this.registry.get(toolName);
    return this.executor.execute(user, toolName, input);
  }
}
