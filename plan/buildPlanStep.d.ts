import type { FieldSet } from '../utilities/FieldSet.js';
import type { GroupedFieldSet } from '../utilities/GroupedFieldSet.js';
export declare function buildPlanStep(groupedFieldSet: GroupedFieldSet): {
  responseKey: string;
  fieldNodes: FieldSet;
}[];
