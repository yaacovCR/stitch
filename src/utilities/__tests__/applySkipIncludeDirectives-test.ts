import { expect } from 'chai';
import type { OperationDefinitionNode } from 'graphql';
import { getOperationAST, GraphQLBoolean, parse, print } from 'graphql';
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
    const variableValues = {
      coerced: { skipA: true, skipB: false, includeC: true, includeD: false },
      sources: {
        skipA: {
          signature: {
            name: 'skipA',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: true,
        },
        skipB: {
          signature: {
            name: 'skipB',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: false,
        },
        includeC: {
          signature: {
            name: 'includeC',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: true,
        },
        includeD: {
          signature: {
            name: 'includeD',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: false,
        },
      },
    };
    const transformedAST = applySkipIncludeDirectives(
      operation,
      variableValues,
    );

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
    const variableValues = {
      coerced: { skipA: true, skipB: false, includeC: true, includeD: false },
      sources: {
        skipA: {
          signature: {
            name: 'skipA',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: true,
        },
        skipB: {
          signature: {
            name: 'skipB',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: false,
        },
        includeC: {
          signature: {
            name: 'includeC',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: true,
        },
        includeD: {
          signature: {
            name: 'includeD',
            type: GraphQLBoolean,
            default: undefined,
          },
          value: false,
        },
      },
    };

    const aTransformedAST = applySkipIncludeDirectives(
      operation,
      variableValues,
    );
    const anotherTransformedAST = applySkipIncludeDirectives(
      operation,
      variableValues,
    );

    expect(aTransformedAST).to.equal(anotherTransformedAST);
  });
});
