import type { IncrementalDeferResult, IncrementalResult } from 'graphql';
export declare function isDeferIncrementalResult(
  incrementalResult: IncrementalResult,
): incrementalResult is IncrementalDeferResult;
