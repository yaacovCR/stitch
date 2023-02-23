import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { buildSchema, execute, OperationTypeNode, parse } from 'graphql';
import { describe, it } from 'mocha';

import { dedent } from '../../__testUtils__/dedent.js';

import { invariant } from '../../utilities/invariant.js';

import { Plan } from '../Plan.js';
import type { Subschema } from '../SuperSchema.js';
import { SuperSchema } from '../SuperSchema.js';

function getSubschema(schema: GraphQLSchema): Subschema {
  return {
    schema,
    executor: (args) =>
      execute({
        ...args,
        schema,
      }),
  };
}

function createPlan(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): Plan {
  const queryType = superSchema.getRootType(OperationTypeNode.QUERY);

  invariant(queryType !== undefined);

  return new Plan(
    superSchema,
    queryType,
    operation.selectionSet.selections,
    {},
  );
}

describe('Plan', () => {
  it('works to split introspection root fields', () => {
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

    const someSubschema = getSubschema(someSchema);
    const anotherSubschema = getSubschema(anotherSchema);
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

    const plan = createPlan(superSchema, operation);

    expect(plan.print()).to.equal(dedent`
      Map:
        Subschema 0:
          {
            __schema {
              queryType {
                name
              }
            }
            __type(name: "Query") {
              name
            }
          }
        Subschema 1:
          {
            someObject {
              someField
            }
          }
        Subschema 2:
          {
            anotherObject {
              someField
            }
          }
    `);
  });

  it('works to split subfields', () => {
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
      }

      type SomeObject {
        anotherField: String
      }
    `);

    const someSubschema = getSubschema(someSchema);
    const anotherSubschema = getSubschema(anotherSchema);
    const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

    const operation = parse(
      `{
        someObject { someField anotherField }
      }`,
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const plan = createPlan(superSchema, operation);

    expect(plan.print()).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField
            }
          }
      SubPlan for 'someObject':
        Map:
          Subschema 1:
            {
              anotherField
            }
    `);
  });

  it('works to split sub-subfields', () => {
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
      }

      type SomeObject {
        someField: SomeNestedObject
      }

      type SomeNestedObject {
        anotherNestedField: String
      }
    `);

    const someSubschema = getSubschema(someSchema);
    const anotherSubschema = getSubschema(anotherSchema);
    const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

    const operation = parse(
      `{
        someObject { someField { someNestedField anotherNestedField } }
      }`,
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const plan = createPlan(superSchema, operation);

    expect(plan.print()).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField {
                someNestedField
              }
            }
          }
      SubPlan for 'someObject':
        SubPlan for 'someField':
          Map:
            Subschema 1:
              {
                anotherNestedField
              }
    `);
  });

  it('works with @defer directive on merged types', () => {
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

    const someSubschema = getSubschema(someSchema);
    const anotherSubschema = getSubschema(anotherSchema);
    const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

    const operation = parse(
      '{ someObject { ... @defer { someField anotherField } } }',
      {
        noLocation: true,
      },
    ).definitions[0] as OperationDefinitionNode;

    const plan = createPlan(superSchema, operation);
    expect(plan.print()).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              ... @defer {
                __identifier__0__2: __typename
                someField
              }
            }
          }
      SubPlan for 'someObject':
        Map:
          Subschema 1:
            {
              ... @defer {
                __identifier__0__2: __typename
                anotherField
              }
            }
    `);
  });
});
