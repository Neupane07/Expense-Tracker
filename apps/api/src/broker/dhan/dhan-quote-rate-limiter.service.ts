import { Injectable } from '@nestjs/common';

const MIN_INTERVAL_MS = 1_100;

@Injectable()
export class DhanQuoteRateLimiterService {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly userChains = new Map<string, Promise<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  async schedule<T>(
    userId: string,
    requestKey: string,
    task: () => Promise<T>,
  ): Promise<T> {
    const inflightKey = `${userId}:${requestKey}`;
    const existing = this.inflight.get(inflightKey);

    if (existing) {
      return existing as Promise<T>;
    }

    const promise = this.enqueue(userId, task);
    this.inflight.set(inflightKey, promise);

    try {
      return await promise;
    } finally {
      this.inflight.delete(inflightKey);
    }
  }

  private enqueue<T>(userId: string, task: () => Promise<T>) {
    const previous = this.userChains.get(userId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        await this.waitForSlot(userId);
        this.lastRequestAt.set(userId, Date.now());
        return task();
      });

    this.userChains.set(userId, next);
    return next;
  }

  private async waitForSlot(userId: string) {
    const last = this.lastRequestAt.get(userId) ?? 0;
    const waitMs = MIN_INTERVAL_MS - (Date.now() - last);

    if (waitMs > 0) {
      await sleep(waitMs);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
