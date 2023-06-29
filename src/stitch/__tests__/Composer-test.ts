import { expect } from 'chai';
import type {
  DocumentNode,
  ExecutionResult,
  GraphQLSchema,
  OperationDefinitionNode,
} from 'graphql';
import {
  buildSchema,
  execute,
  GraphQLError,
  Kind,
  OperationTypeNode,
  parse,
} from 'graphql';
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue.js';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';

import type { Stitch } from '../Composer.js';
import { Composer } from '../Composer.js';
import { Planner } from '../Planner.js';
import type { Subschema } from '../SuperSchema.js';
import { SuperSchema } from '../SuperSchema.js';

function getSubschema(schema: GraphQLSchema, rootValue: unknown): Subschema {
  return {
    schema,
    executor: (args) =>
      execute({
        ...args,
        schema,
        rootValue,
      }),
  };
}

function executeWithComposer(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): PromiseOrValue<ExecutionResult> {
  const queryType = superSchema.getRootType(OperationTypeNode.QUERY);

  invariant(queryType !== undefined);

  const fieldPlan = new Planner(superSchema, operation).createRootFieldPlan();

  invariant(!(fieldPlan instanceof GraphQLError));

  const stitches: Array<Stitch> = [];

  for (const [subschema, subschemaPlan] of fieldPlan.subschemaPlans) {
    const document: DocumentNode = {
      kind: Kind.DOCUMENT,
      definitions: [
        {
          ...operation,
          selectionSet: {
            kind: Kind.SELECTION_SET,
            selections: subschemaPlan.fieldNodes,
          },
        },
      ],
    };

    stitches.push({
      fromSubschema: subschema,
      stitchPlans: subschemaPlan.stitchPlans,
      initialResult: subschema.executor({
        document,
      }),
    });
  }

  const composer = new Composer(stitches, fieldPlan.superSchema, undefined);

  return composer.compose();
}

describe('Composer', () => {
  describe('stitching', () => {
    it('works to stitch introspection root fields', () => {
      const someSchema = buildSchema(`
        type Query {
          someObject: SomeObject
        }

        type SomeObject {
          someField: String
        }
      `);

      const anotherSchema = buildSchema(`
        type Query {
          anotherObject: AnotherObject
        }

        type AnotherObject {
          someField: String
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: { someField: 'someField' },
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherObject: { someField: 'someField' },
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse(
        `{
          __schema { queryType { name } }
          __type(name: "Query") { name }
          someObject { someField }
          anotherObject { someField }
        }`,
        { noLocation: true },
      ).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          __schema: {
            queryType: {
              name: 'Query',
            },
          },
          __type: {
            name: 'Query',
          },
          someObject: {
            someField: 'someField',
          },
          anotherObject: {
            someField: 'someField',
          },
        },
      });
    });

    it('works to stitch subfields', () => {
      const someSchema = buildSchema(`
      type Query {
          someObject: SomeObject
        }

        type SomeObject {
          someField: String
        }
      `);

      const anotherSchema = buildSchema(`
      type Query {
          someObject: SomeObject
          anotherField: String
        }

        type SomeObject {
          anotherField: String
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: { someField: 'someField' },
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherField: 'anotherField',
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse('{ someObject { someField anotherField } }', {
        noLocation: true,
      }).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          someObject: {
            __stitching__typename: 'SomeObject',
            someField: 'someField',
            anotherField: 'anotherField',
          },
        },
      });
    });

    it('works to stitch sub-subfields', () => {
      const someSchema = buildSchema(`
        type Query {
          someObject: SomeObject
        }

        type SomeObject {
          someField: SomeNestedObject
        }

        type SomeNestedObject {
          someNestedField: String
        }
      `);

      const anotherSchema = buildSchema(`
        type Query {
          someObject: SomeObject
          anotherNestedField: String
        }

        type SomeObject {
          someField: SomeNestedObject
        }

        type SomeNestedObject {
          anotherNestedField: String
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: { someField: { someNestedField: 'someNestedField' } },
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherNestedField: 'anotherNestedField',
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse(
        '{ someObject { someField { someNestedField anotherNestedField } } }',
        { noLocation: true },
      ).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          someObject: {
            __stitching__typename: 'SomeObject',
            someField: {
              __stitching__typename: 'SomeNestedObject',
              someNestedField: 'someNestedField',
              anotherNestedField: 'anotherNestedField',
            },
          },
        },
      });
    });
  });

  describe('stitching with lists', () => {
    it('works to stitch root fields ', () => {
      const someSchema = buildSchema(`
        type Query {
          someObject: [SomeObject]
        }

        type SomeObject {
          someField: [String]
        }
      `);

      const anotherSchema = buildSchema(`
        type Query {
          anotherObject: [AnotherObject]
        }

        type AnotherObject {
          someField: [String]
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: [{ someField: ['someField'] }],
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherObject: [{ someField: ['someField'] }],
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse(
        '{ someObject { someField } anotherObject { someField } }',
        { noLocation: true },
      ).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          someObject: [
            {
              someField: ['someField'],
            },
          ],
          anotherObject: [
            {
              someField: ['someField'],
            },
          ],
        },
      });
    });

    it('works to stitch subfields', () => {
      const someSchema = buildSchema(`
        type Query {
          someObject: [SomeObject]
        }

        type SomeObject {
          someField: [String]
        }
    `);

      const anotherSchema = buildSchema(`
        type Query {
          someObject: [SomeObject]
          anotherField: [String]
        }

        type SomeObject {
          anotherField: [String]
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: [
          { someField: ['someFieldA'] },
          { someField: ['someFieldB'] },
        ],
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherField: ['anotherField'],
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse('{ someObject { someField anotherField } }', {
        noLocation: true,
      }).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          someObject: [
            {
              __stitching__typename: 'SomeObject',
              someField: ['someFieldA'],
              anotherField: ['anotherField'],
            },
            {
              __stitching__typename: 'SomeObject',
              someField: ['someFieldB'],
              anotherField: ['anotherField'],
            },
          ],
        },
      });
    });

    it('works to stitch sub-subfields', () => {
      const someSchema = buildSchema(`
        type Query {
          someObject: [SomeObject]
        }

        type SomeObject {
          someField: [SomeNestedObject]
        }

        type SomeNestedObject {
          someNestedField: [String]
        }
      `);

      const anotherSchema = buildSchema(`
        type Query {
          someObject: [SomeObject]
          anotherNestedField: [String]
        }

        type SomeObject {
          someField: [SomeNestedObject]
        }

        type SomeNestedObject {
          anotherNestedField: [String]
        }
      `);

      const someSubschema = getSubschema(someSchema, {
        someObject: [
          {
            __stitching__typename: 'SomeObject',
            someField: [
              { someNestedField: ['someNestedFieldA'] },
              { someNestedField: ['someNestedFieldB'] },
            ],
          },
          {
            __stitching__typename: 'SomeObject',
            someField: [
              { someNestedField: ['someNestedField1'] },
              { someNestedField: ['someNestedField2'] },
            ],
          },
        ],
      });
      const anotherSubschema = getSubschema(anotherSchema, {
        anotherNestedField: ['anotherNestedField'],
      });
      const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

      const operation = parse(
        '{ someObject { someField { someNestedField anotherNestedField } } }',
        { noLocation: true },
      ).definitions[0] as OperationDefinitionNode;

      const result = executeWithComposer(superSchema, operation);

      expect(result).to.deep.equal({
        data: {
          someObject: [
            {
              __stitching__typename: 'SomeObject',
              someField: [
                {
                  __stitching__typename: 'SomeNestedObject',
                  someNestedField: ['someNestedFieldA'],
                  anotherNestedField: ['anotherNestedField'],
                },
                {
                  __stitching__typename: 'SomeNestedObject',
                  someNestedField: ['someNestedFieldB'],
                  anotherNestedField: ['anotherNestedField'],
                },
              ],
            },
            {
              __stitching__typename: 'SomeObject',
              someField: [
                {
                  __stitching__typename: 'SomeNestedObject',
                  someNestedField: ['someNestedField1'],
                  anotherNestedField: ['anotherNestedField'],
                },
                {
                  __stitching__typename: 'SomeNestedObject',
                  someNestedField: ['someNestedField2'],
                  anotherNestedField: ['anotherNestedField'],
                },
              ],
            },
          ],
        },
      });
    });
  });
});
