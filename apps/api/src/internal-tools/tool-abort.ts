import { RequestTimeoutException } from '@nestjs/common';

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new RequestTimeoutException('TOOL_EXECUTION_ABORTED');
  }
}
