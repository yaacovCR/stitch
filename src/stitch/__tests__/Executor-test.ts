import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { buildSchema, execute, OperationTypeNode, parse } from 'graphql';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';

import { Executor } from '../Executor.js';
import { Plan } from '../Plan.js';
import type { OperationContext, Subschema } from '../SuperSchema.js';
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

function createExecutor(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): Executor {
  const queryType = superSchema.getRootType(OperationTypeNode.QUERY);

  invariant(queryType !== undefined);

  const plan = new Plan(
    { superSchema, fragmentMap: {} } as OperationContext,
    queryType,
    operation.selectionSet.selections,
  );

  return new Executor(plan, operation, [], undefined);
}

describe('Executor', () => {
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
        data: {
          someObject: {
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
        data: {
          someObject: {
            someField: {
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
        data: {
          someObject: [
            {
              someField: ['someFieldA'],
              anotherField: ['anotherField'],
            },
            {
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
            someField: [
              { someNestedField: ['someNestedFieldA'] },
              { someNestedField: ['someNestedFieldB'] },
            ],
          },
          {
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

      const executor = createExecutor(superSchema, operation);

      expect(executor.execute()).to.deep.equal({
        data: {
          someObject: [
            {
              someField: [
                {
                  someNestedField: ['someNestedFieldA'],
                  anotherNestedField: ['anotherNestedField'],
                },
                {
                  someNestedField: ['someNestedFieldB'],
                  anotherNestedField: ['anotherNestedField'],
                },
              ],
            },
            {
              someField: [
                {
                  someNestedField: ['someNestedField1'],
                  anotherNestedField: ['anotherNestedField'],
                },
                {
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
