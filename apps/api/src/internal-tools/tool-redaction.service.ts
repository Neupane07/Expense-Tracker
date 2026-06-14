import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|credential|apikey|api_key|apisecret|api_secret|accesstoken|access_token|refreshtoken|refresh_token|session|cookie|authorization|bearer|privatekey|private_key)/i;

const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^dhan[_-]/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,
];

@Injectable()
export class ToolRedactionService {
  redactValue<T>(value: T): T {
    return this.redactUnknown(value) as T;
  }

  hashInputMeta(input: unknown): string {
    const redacted = this.redactUnknown(input);
    const serialized = JSON.stringify(redacted ?? null);
    return createHash('sha256').update(serialized).digest('hex');
  }

  buildInputMeta(input: unknown): Record<string, unknown> {
    const redacted = this.redactUnknown(input);

    if (redacted == null || typeof redacted !== 'object') {
      return { value: redacted };
    }

    if (Array.isArray(redacted)) {
      return { keys: [], arrayLength: redacted.length };
    }

    const record = redacted as Record<string, unknown>;
    return {
      keys: Object.keys(record).sort(),
      fieldCount: Object.keys(record).length,
      preview: this.summarizeRecord(record),
    };
  }

  private summarizeRecord(record: Record<string, unknown>) {
    const preview: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(record)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        preview[key] = REDACTED;
        continue;
      }

      if (typeof value === 'string' && this.looksLikeSecret(value)) {
        preview[key] = REDACTED;
        continue;
      }

      if (typeof value === 'string') {
        preview[key] = value.length > 80 ? `${value.slice(0, 80)}…` : value;
        continue;
      }

      if (typeof value === 'number' || typeof value === 'boolean') {
        preview[key] = value;
        continue;
      }

      if (Array.isArray(value)) {
        preview[key] = `[array:${value.length}]`;
        continue;
      }

      if (value && typeof value === 'object') {
        preview[key] = '[object]';
      }
    }

    return preview;
  }

  private redactUnknown(value: unknown, parentKey?: string): unknown {
    if (value == null) {
      return value;
    }

    if (typeof value === 'string') {
      if (parentKey && SENSITIVE_KEY_PATTERN.test(parentKey)) {
        return REDACTED;
      }

      if (this.looksLikeSecret(value)) {
        return REDACTED;
      }

      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactUnknown(item));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          output[key] = REDACTED;
          continue;
        }

        output[key] = this.redactUnknown(nested, key);
      }

      return output;
    }

    return value;
  }

  private looksLikeSecret(value: string) {
    if (value.length < 12) {
      return false;
    }

    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
}
