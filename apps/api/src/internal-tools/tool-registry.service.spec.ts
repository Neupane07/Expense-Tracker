import { z } from 'zod';
import { ToolRegistryService } from './tool-registry.service';

describe('ToolRegistryService', () => {
  it('registers and lists catalog entries with schemas', () => {
    const registry = new ToolRegistryService();
    registry.register({
      name: 'demo_tool',
      version: '1',
      description: 'Demo',
      readOnly: true,
      inputSchema: z.object({ symbol: z.string() }).strict(),
      outputSchema: z.record(z.string(), z.unknown()),
      handler: () =>
        Promise.resolve({
          status: 'ok' as const,
          data: { symbol: 'TCS' },
        }),
    });

    const catalog = registry.list();
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      name: 'demo_tool',
      version: '1',
      readOnly: true,
    });
    expect(catalog[0].inputSchema).toBeTruthy();
    expect(catalog[0].outputSchema).toBeTruthy();
  });

  it('throws for unknown tools', () => {
    const registry = new ToolRegistryService();
    expect(() => registry.get('missing_tool')).toThrow('Unknown tool');
  });
});
