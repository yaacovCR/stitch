import { expect } from 'chai';
import type { OperationDefinitionNode } from 'graphql';
import { getOperationAST, parse, print } from 'graphql';
import { describe, it } from 'mocha';

import { dedent } from '../../__testUtils__/dedent.js';

import { applySkipIncludeDirectives } from '../applySkipIncludeDirectives.js';

describe('applySkipIncludeDirectives', () => {
  it('can apply directives', () => {
    const document = parse(dedent`
      query withSkipInclude($skipA: Boolean, $skipB: Boolean, $includeC: Boolean, $includeD: Boolean) {
        a @skip(if: $skipA)
        b @skip(if: $skipB)
        c @include(if: $includeC)
        d @include(if: $includeD)
      }
    `);

    const operation = getOperationAST(
      document,
      'withSkipInclude',
    ) as OperationDefinitionNode;
    const transformedAST = applySkipIncludeDirectives(operation, {
      skipA: true,
      skipB: false,
      includeC: true,
      includeD: false,
    });

    expect(print(transformedAST)).to.equal(dedent`
      query withSkipInclude($skipA: Boolean, $skipB: Boolean, $includeC: Boolean, $includeD: Boolean) {
        b @skip(if: $skipB)
        c @include(if: $includeC)
      }
    `);
  });

  it('maintains cache', () => {
    const document = parse(dedent`
      query withSkipInclude($skipA: Boolean, $skipB: Boolean, $includeC: Boolean, $includeD: Boolean) {
        a @skip(if: $skipA)
        b @skip(if: $skipB)
        c @include(if: $includeC)
        d @include(if: $includeD)
      }
    `);

    const operation = getOperationAST(
      document,
      'withSkipInclude',
    ) as OperationDefinitionNode;
    const aTransformedAST = applySkipIncludeDirectives(operation, {
      skipA: true,
      skipB: false,
      includeC: true,
      includeD: false,
    });

    const anotherTransformedAST = applySkipIncludeDirectives(operation, {
      skipA: true,
      skipB: false,
      includeC: true,
      includeD: false,
    });

    expect(aTransformedAST).to.equal(anotherTransformedAST);
  });
});
