export function isDeferIncrementalResult(incrementalResult) {
  return 'data' in incrementalResult;
}
