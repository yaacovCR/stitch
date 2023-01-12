import type { FieldSet } from '../utilities/FieldSet.ts';
import type { GroupedFieldSet } from '../utilities/GroupedFieldSet.ts';
export function buildPlanStep(groupedFieldSet: GroupedFieldSet) {
  const result: Array<{
    responseKey: string;
    fieldNodes: FieldSet;
  }> = [];
  for (const [responseKey, fieldNodes] of groupedFieldSet) {
    result.push({
      responseKey,
      fieldNodes,
    });
  }
  return result;
}
