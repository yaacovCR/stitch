import { expect } from 'chai';
import { Kind } from 'graphql';
import { describe, it } from 'mocha';

import type { FieldSet } from '../../utilities/FieldSet.js';
import type { GroupedFieldSet } from '../../utilities/GroupedFieldSet.js';

import { buildPlanStep } from '../buildPlanStep.js';

function buildGroupedFieldSet(groupedFieldSet: {
  [responseName: string]: FieldSet;
}): GroupedFieldSet {
  return new Map(Object.entries(groupedFieldSet));
}

describe('buildPlanStep', () => {
  it('should work', () => {
    const groupedFieldSet = buildGroupedFieldSet({
      foo: [{ kind: Kind.FIELD, name: { kind: Kind.NAME, value: 'foo' } }],
    });

    const result = buildPlanStep(groupedFieldSet);
    expect(result).to.deep.equal([
      {
        responseKey: 'foo',
        fieldNodes: [
          { kind: Kind.FIELD, name: { kind: Kind.NAME, value: 'foo' } },
        ],
      },
    ]);
  });
});
