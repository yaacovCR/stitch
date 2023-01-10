import type { FieldSet } from '../utilities/FieldSet.js';
import type { GroupedFieldSet } from '../utilities/GroupedFieldSet.js';

export function buildPlanStep(groupedFieldSet: GroupedFieldSet) {
  const result: Array<{ responseKey: string; fieldNodes: FieldSet }> = [];
  for (const [responseKey, fieldNodes] of groupedFieldSet) {
    result.push({
      responseKey,
      fieldNodes,
    });
  }
  return result;
}
