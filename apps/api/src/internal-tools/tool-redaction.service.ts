import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(password|secret|token|credential|apikey|api_key|apisecret|api_secret|accesstoken|access_token|refreshtoken|refresh_token|session|cookie|authorization|bearer|privatekey|private_key)/i;

const AUDIT_FINANCIAL_VALUE_KEY_PATTERN =
  /^(entry|target|stopLoss|stop_loss|quantity|capital|limitPrice|targetPrice|stopLossPrice|price|averageTradedPrice|plannedEntry|plannedTarget|plannedStopLoss)$/i;

const SECRET_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^dhan[_-]/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./,
];

@Injectable()
export class ToolRedactionService {
  /** Redact credentials and secret-shaped values from tool HTTP responses. */
  redactResponse<T>(value: T): T {
    return this.redactSecretsOnly(value) as T;
  }

  /** Redact any secret material when returning persisted audit metadata. */
  redactAuditRecord<T>(value: T): T {
    return this.redactSecretsOnly(value) as T;
  }

  hashInputMeta(input: unknown): string {
    const secretsRedacted = this.redactSecretsOnly(input);
    const serialized = JSON.stringify(this.canonicalize(secretsRedacted));
    return createHash('sha256').update(serialized).digest('hex');
  }

  buildInputMeta(input: unknown): Record<string, unknown> {
    if (input == null || typeof input !== 'object') {
      return { value: typeof input };
    }

    if (Array.isArray(input)) {
      return { keys: [], arrayLength: input.length };
    }

    const record = input as Record<string, unknown>;
    return {
      keys: Object.keys(record).sort(),
      fieldCount: Object.keys(record).length,
      fieldTypes: this.describeAuditFieldTypes(record),
    };
  }

  private describeAuditFieldTypes(record: Record<string, unknown>) {
    const fieldTypes: Record<string, string> = {};

    for (const [key, value] of Object.entries(record)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        fieldTypes[key] = 'redacted';
        continue;
      }

      if (AUDIT_FINANCIAL_VALUE_KEY_PATTERN.test(key)) {
        fieldTypes[key] = 'redacted';
        continue;
      }

      if (value == null) {
        fieldTypes[key] = 'null';
        continue;
      }

      if (Array.isArray(value)) {
        fieldTypes[key] = `array:${value.length}`;
        continue;
      }

      fieldTypes[key] = typeof value;
    }

    return fieldTypes;
  }

  private redactSecretsOnly(value: unknown, parentKey?: string): unknown {
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

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.redactSecretsOnly(item));
    }

    if (typeof value === 'object') {
      const output: Record<string, unknown> = {};

      for (const [key, nested] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          output[key] = REDACTED;
          continue;
        }

        output[key] = this.redactSecretsOnly(nested, key);
      }

      return output;
    }

    return value;
  }

  private canonicalize(value: unknown): unknown {
    if (value == null || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalize(item));
    }

    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};

    for (const key of Object.keys(record).sort()) {
      sorted[key] = this.canonicalize(record[key]);
    }

    return sorted;
  }

  private looksLikeSecret(value: string) {
    if (value.length < 12) {
      return false;
    }

    return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  }
}
