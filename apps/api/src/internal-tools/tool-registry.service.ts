import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import type { ToolCatalogEntry, ToolDefinition } from './tool.types';

@Injectable()
export class ToolRegistryService {
  private readonly tools = new Map<string, ToolDefinition>();

  register(definition: ToolDefinition) {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool already registered: ${definition.name}`);
    }

    this.tools.set(definition.name, definition);
  }

  list(): ToolCatalogEntry[] {
    return [...this.tools.values()].map((tool) => this.toCatalogEntry(tool));
  }

  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);

    if (!tool) {
      throw new NotFoundException(`Unknown tool: ${name}`);
    }

    return tool;
  }

  describe(name: string): ToolCatalogEntry {
    return this.toCatalogEntry(this.get(name));
  }

  private toCatalogEntry(tool: ToolDefinition): ToolCatalogEntry {
    return {
      name: tool.name,
      version: tool.version,
      description: tool.description,
      readOnly: true,
      inputSchema: z.toJSONSchema(tool.inputSchema),
      outputSchema: z.toJSONSchema(tool.outputSchema),
    };
  }
}
