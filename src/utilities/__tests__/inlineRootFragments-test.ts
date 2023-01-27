import { expect } from 'chai';
import type { FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import { parse } from 'graphql';
import { describe, it } from 'mocha';

import { inlineRootFragments } from '../inlineRootFragments.js';
import { parseSelectionSet } from '../parseSelectionSet.js';

describe('inlineRootFragments', () => {
  it('works', () => {
    const document = parse(
      `
      {
        someField
        ... {
          anotherField
        }
        ...SomeFragment
      }

      fragment SomeFragment on Query {
        fragmentField
      }
      `,
      { noLocation: true },
    );

    const operation = document.definitions[0] as OperationDefinitionNode;
    const fragmentMap = {
      SomeFragment: document.definitions[1] as FragmentDefinitionNode,
    };

    const selectionSet = inlineRootFragments(
      operation.selectionSet,
      fragmentMap,
    );

    const expectedSelectionSet = parseSelectionSet(`
      {
        someField
        ... {
          anotherField
        }
        ... on Query {
          fragmentField
        }
      }
    `);

    expect(selectionSet).to.deep.equal(expectedSelectionSet);
  });
});
