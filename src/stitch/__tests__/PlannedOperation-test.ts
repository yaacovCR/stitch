import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { buildSchema, execute, OperationTypeNode, parse } from 'graphql';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';

import { Plan } from '../Plan.js';
import { PlannedOperation } from '../PlannedOperation.js';
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

function createPlannedOperation(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): PlannedOperation {
  const queryType = superSchema.getRootType(OperationTypeNode.QUERY);

  invariant(queryType !== undefined);

  const plan = new Plan(
    superSchema,
    queryType,
    operation.selectionSet.selections,
    {},
  );

  return new PlannedOperation(plan, operation, [], undefined);
}

describe('PlannedOperation', () => {
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

    const plannedOperaton = createPlannedOperation(superSchema, operation);

    expect(plannedOperaton.execute()).to.deep.equal({
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
});
