import type { IncrementalDeferResult, IncrementalResult } from 'graphql';

export function isDeferIncrementalResult(
  incrementalResult: IncrementalResult,
): incrementalResult is IncrementalDeferResult {
  return 'data' in incrementalResult;
}
