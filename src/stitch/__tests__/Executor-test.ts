import { expect } from 'chai';
import type {
  ExecutionResult,
  ExperimentalIncrementalExecutionResults,
  GraphQLSchema,
  InitialIncrementalExecutionResult,
  OperationDefinitionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import {
  buildSchema,
  experimentalExecuteIncrementally,
  OperationTypeNode,
  parse,
} from 'graphql';
import type { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue.js';
import { describe, it } from 'mocha';

import { isPromise } from '../../predicates/isPromise.js';
import { invariant } from '../../utilities/invariant.js';

import { Executor } from '../Executor.js';
import { Plan } from '../Plan.js';
import type { Subschema } from '../SuperSchema.js';
import { SuperSchema } from '../SuperSchema.js';

function getSubschema(schema: GraphQLSchema, rootValue: unknown): Subschema {
  return {
    schema,
    executor: (args) =>
      experimentalExecuteIncrementally({
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
    superSchema,
    queryType,
    operation.selectionSet.selections,
    {},
  );

  return new Executor(plan, operation, [], undefined);
}

async function complete(
  maybePromisedResult: PromiseOrValue<
    ExecutionResult | ExperimentalIncrementalExecutionResults
  >,
): Promise<
  | ExecutionResult
  | Array<
      InitialIncrementalExecutionResult | SubsequentIncrementalExecutionResult
    >
> {
  const result = isPromise(maybePromisedResult)
    ? await maybePromisedResult
    : maybePromisedResult;
  if ('initialResult' in result) {
    const results: Array<
      InitialIncrementalExecutionResult | SubsequentIncrementalExecutionResult
    > = [result.initialResult];
    for await (const subsequentResult of result.subsequentResults) {
      results.push(subsequentResult);
    }
    return results;
  }
  return result;
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

  describe('stitching with defer', () => {
    it('works to stitch deferred subfields', async () => {
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

      const operation = parse(
        '{ someObject { ... @defer { someField anotherField } } }',
        {
          noLocation: true,
        },
      ).definitions[0] as OperationDefinitionNode;

      const executor = createExecutor(superSchema, operation);

      expect(await complete(executor.execute())).to.deep.equal([
        {
          data: { someObject: [{}, {}] },
          hasNext: true,
        },
        {
          incremental: [
            {
              data: {
                someField: ['someFieldA'],
                anotherField: ['anotherField'],
              },

              path: ['someObject', 0],
            },
          ],
          hasNext: true,
        },
        {
          incremental: [
            {
              data: {
                someField: ['someFieldB'],
                anotherField: ['anotherField'],
              },

              path: ['someObject', 1],
            },
          ],
          hasNext: false,
        },
      ]);
    });
  });

  it('works to stitch deferred sub-subfields', async () => {
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
      '{ someObject { someField { ... @defer { someNestedField anotherNestedField } } } }',
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const executor = createExecutor(superSchema, operation);

    expect(await complete(executor.execute())).to.deep.equal([
      {
        data: {
          someObject: [
            {
              someField: [{}, {}],
            },
            {
              someField: [{}, {}],
            },
          ],
        },
        hasNext: true,
      },
      {
        incremental: [
          {
            data: {
              someNestedField: ['someNestedFieldA'],
              anotherNestedField: ['anotherNestedField'],
            },
            path: ['someObject', 0, 'someField', 0],
          },
        ],
        hasNext: true,
      },
      {
        incremental: [
          {
            data: {
              someNestedField: ['someNestedFieldB'],
              anotherNestedField: ['anotherNestedField'],
            },
            path: ['someObject', 0, 'someField', 1],
          },
        ],
        hasNext: true,
      },
      {
        incremental: [
          {
            data: {
              someNestedField: ['someNestedField1'],
              anotherNestedField: ['anotherNestedField'],
            },
            path: ['someObject', 1, 'someField', 0],
          },
        ],
        hasNext: true,
      },
      {
        incremental: [
          {
            data: {
              someNestedField: ['someNestedField2'],
              anotherNestedField: ['anotherNestedField'],
            },
            path: ['someObject', 1, 'someField', 1],
          },
        ],
        hasNext: false,
      },
    ]);
  });

  it('works to stitch subfields of deferred subfields', async () => {
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
      '{ someObject { ... @defer { someField { someNestedField anotherNestedField } } } }',
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const executor = createExecutor(superSchema, operation);

    expect(await complete(executor.execute())).to.deep.equal([
      {
        data: {
          someObject: [{}, {}],
        },
        hasNext: true,
      },
      {
        incremental: [
          {
            data: {
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
            path: ['someObject', 0],
          },
        ],
        // FIXME: this should be true!
        hasNext: false,
      },
      {
        incremental: [
          {
            data: {
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
            path: ['someObject', 1],
          },
        ],
        hasNext: false,
      },
    ]);
  });
});
