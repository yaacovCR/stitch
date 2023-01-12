export function buildPlanStep(groupedFieldSet) {
  const result = [];
  for (const [responseKey, fieldNodes] of groupedFieldSet) {
    result.push({
      responseKey,
      fieldNodes,
    });
  }
  return result;
}
