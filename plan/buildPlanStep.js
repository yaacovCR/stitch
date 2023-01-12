'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildPlanStep = void 0;
function buildPlanStep(groupedFieldSet) {
  const result = [];
  for (const [responseKey, fieldNodes] of groupedFieldSet) {
    result.push({
      responseKey,
      fieldNodes,
    });
  }
  return result;
}
exports.buildPlanStep = buildPlanStep;
