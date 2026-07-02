import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthenticatedUser } from '../auth/auth.types';

export type McpRequestContext = {
  user: AuthenticatedUser;
  tokenId: string;
};

export const mcpRequestContext = new AsyncLocalStorage<McpRequestContext>();

export function getMcpRequestContext(): McpRequestContext | undefined {
  return mcpRequestContext.getStore();
}
