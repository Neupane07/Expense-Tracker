/**
 * Shared Finance OS data-quality vocabulary for Phase 8+ services.
 * Existing per-module response shapes remain compatible; new work should
 * compose these types rather than inventing parallel labels.
 */

export type DataFreshness = 'LIVE' | 'RECENT' | 'STALE' | 'MISSING';

export type DataConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type MappingStatus =
  | 'VERIFIED'
  | 'INFERRED'
  | 'UNVERIFIED'
  | 'MISSING'
  | 'AMBIGUOUS';

export type ReadinessStatus = 'READY' | 'DEGRADED' | 'BLOCKED';

export type SourceMetadata = {
  source: string | null;
  asOf: string | null;
  timestamp: string | null;
};

export type DataQualityMeta = {
  freshness: DataFreshness;
  confidence: DataConfidence;
  mappingStatus?: MappingStatus;
  readiness?: ReadinessStatus;
};

export type QualitySignals = {
  warnings: string[];
  rejectReasons: string[];
  blockers: string[];
};

export type ReadinessCheckResult = {
  id: string;
  label: string;
  status: ReadinessStatus;
  mappingStatus?: MappingStatus;
  freshness?: DataFreshness;
  source?: string | null;
  asOf?: string | null;
  warnings: string[];
  blockers: string[];
  details?: Record<string, unknown>;
};

export type ReadinessReport = SourceMetadata &
  QualitySignals & {
    status: ReadinessStatus;
    checks: ReadinessCheckResult[];
    universe: string[];
    universeSource: 'holdings' | 'symbols';
  };

export function emptyQualitySignals(): QualitySignals {
  return {
    warnings: [],
    rejectReasons: [],
    blockers: [],
  };
}

export function mergeQualitySignals(
  ...groups: Array<Partial<QualitySignals>>
): QualitySignals {
  const warnings = new Set<string>();
  const rejectReasons = new Set<string>();
  const blockers = new Set<string>();

  for (const group of groups) {
    for (const value of group.warnings ?? []) {
      warnings.add(value);
    }
    for (const value of group.rejectReasons ?? []) {
      rejectReasons.add(value);
    }
    for (const value of group.blockers ?? []) {
      blockers.add(value);
    }
  }

  return {
    warnings: [...warnings],
    rejectReasons: [...rejectReasons],
    blockers: [...blockers],
  };
}

export function deriveReadinessStatus(input: {
  blockers: string[];
  warnings: string[];
  checks: ReadinessCheckResult[];
}): ReadinessStatus {
  if (
    input.blockers.length > 0 ||
    input.checks.some((check) => check.status === 'BLOCKED')
  ) {
    return 'BLOCKED';
  }

  if (
    input.warnings.length > 0 ||
    input.checks.some((check) => check.status === 'DEGRADED')
  ) {
    return 'DEGRADED';
  }

  return 'READY';
}

export function toIsoTimestamp(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function buildSourceMetadata(input: {
  source?: string | null;
  asOf?: Date | string | null;
  timestamp?: Date | string | null;
}): SourceMetadata {
  return {
    source: input.source ?? null,
    asOf: toIsoTimestamp(input.asOf ?? input.timestamp ?? null),
    timestamp: toIsoTimestamp(input.timestamp ?? input.asOf ?? null),
  };
}
