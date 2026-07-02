import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ToolRegistryService } from '../internal-tools/tool-registry.service';
import {
  MCP_ALLOWED_TOOL_NAMES,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from './mcp.constants';
import { getMcpRequestContext } from './mcp-request-context';
import { createMcpInputSchema } from './mcp-input-normalizer';
import { McpToolBridgeService } from './mcp-tool-bridge.service';

export type McpRuntimeSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class McpRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(McpRuntimeService.name);
  private activeSessions = 0;
  private shuttingDown = false;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: ToolRegistryService,
    private readonly bridge: McpToolBridgeService,
  ) {}

  isEnabled() {
    return this.config.get<string>('MCP_ENABLED') === 'true';
  }

  getReadiness() {
    if (!this.isEnabled()) {
      return {
        status: 'disabled' as const,
        transport: 'streamable-http',
        activeSessions: 0,
      };
    }

    return {
      status: 'ok' as const,
      transport: 'streamable-http',
      exposedToolCount: MCP_ALLOWED_TOOL_NAMES.length,
      activeSessions: this.activeSessions,
      shuttingDown: this.shuttingDown,
    };
  }

  onModuleDestroy() {
    this.shuttingDown = true;
  }

  async createSession(): Promise<McpRuntimeSession> {
    if (this.shuttingDown) {
      throw new Error('MCP server is shutting down.');
    }

    const server = new McpServer(
      {
        name: MCP_SERVER_NAME,
        version: MCP_SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    for (const toolName of MCP_ALLOWED_TOOL_NAMES) {
      const definition = this.registry.get(toolName);

      server.registerTool(
        definition.name,
        {
          description: definition.description,
          inputSchema: createMcpInputSchema(definition.inputSchema),
          annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            openWorldHint: false,
          },
        },
        async (input) => this.handleToolCall(definition.name, input),
      );
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    this.activeSessions += 1;

    transport.onclose = () => {
      this.activeSessions = Math.max(0, this.activeSessions - 1);
    };

    return { server, transport };
  }

  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
  ) {
    const session = await this.createSession();

    try {
      await session.transport.handleRequest(req, res, parsedBody);
    } catch (error) {
      this.logger.error(
        'MCP transport request failed',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await this.closeSession(session);
    }
  }

  private async handleToolCall(toolName: string, input: unknown) {
    const context = getMcpRequestContext();

    if (!context) {
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: 'MCP request context is missing.',
          },
        ],
      };
    }

    try {
      const envelope = await this.bridge.executeTool(
        context.user,
        toolName,
        input,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(envelope),
          },
        ],
        structuredContent: envelope as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Tool execution failed';

      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: message,
          },
        ],
      };
    }
  }

  private async closeSession(session: McpRuntimeSession) {
    try {
      await session.transport.close();
    } catch (error) {
      this.logger.warn(
        'Failed to close MCP transport cleanly',
        error instanceof Error ? error.message : undefined,
      );
    }

    try {
      await session.server.close();
    } catch (error) {
      this.logger.warn(
        'Failed to close MCP server cleanly',
        error instanceof Error ? error.message : undefined,
      );
    }
  }
}
