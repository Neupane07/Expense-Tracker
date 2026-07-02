import {
  emptyInputSchema,
  marketDataStatusInputSchema,
  symbolInputSchema,
} from '../internal-tools/tool-schemas';
import {
  createMcpInputSchema,
  normalizeMcpToolInput,
} from './mcp-input-normalizer';

describe('normalizeMcpToolInput', () => {
  it('returns {} for empty-input tools when MCP sends only _meta', () => {
    expect(
      normalizeMcpToolInput(
        { _meta: { progressToken: 'abc' } },
        emptyInputSchema,
      ),
    ).toEqual({});
  });

  it('strips transport keys and unknown fields for strict symbol input', () => {
    expect(
      normalizeMcpToolInput(
        {
          _meta: { progressToken: 'abc' },
          symbol: 'INFY',
          extra: 'ignore-me',
        },
        symbolInputSchema,
      ),
    ).toEqual({ symbol: 'INFY' });
  });

  it('keeps only schema-declared optional fields', () => {
    expect(
      normalizeMcpToolInput(
        {
          _meta: {},
          symbols: ['INFY', 'TCS'],
          universe: 'symbols',
        },
        marketDataStatusInputSchema,
      ),
    ).toEqual({ symbols: ['INFY', 'TCS'] });
  });
});

describe('createMcpInputSchema', () => {
  it('accepts MCP metadata for empty-input tools', () => {
    const schema = createMcpInputSchema(emptyInputSchema);
    const parsed = schema.safeParse({ _meta: { progressToken: 'abc' } });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({});
  });
});
