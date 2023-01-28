import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { buildSchema, execute, OperationTypeNode, parse } from 'graphql';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';
import { parseSelectionSet } from '../../utilities/parseSelectionSet.js';

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

  return new Plan(superSchema, queryType, operation.selectionSet, {});
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

    const iteration = plan.map.keys().next();
    invariant(!iteration.done);

    const mergedSubschema = iteration.value;
    const mergedSubschemaSelectionSet = plan.map.get(mergedSubschema);
    expect(mergedSubschemaSelectionSet).to.deep.equal(
      parseSelectionSet(
        `{
          __schema { queryType { name } }
          __type(name: "Query") { name }
        }`,
      ),
    );

    const someSubschemaSelectionSet = plan.map.get(someSubschema);
    expect(someSubschemaSelectionSet).to.deep.equal(
      parseSelectionSet(
        `{
          someObject { someField }
        }`,
      ),
    );

    const anotherSubschemaSelectionSet = plan.map.get(anotherSubschema);
    expect(anotherSubschemaSelectionSet).to.deep.equal(
      parseSelectionSet(
        `{
          anotherObject { someField }
        }`,
      ),
    );
  });
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

  const someSubschemaSelectionSet = plan.map.get(someSubschema);
  expect(someSubschemaSelectionSet).to.deep.equal(
    parseSelectionSet(
      `{
        someObject { someField }
      }`,
    ),
  );

  const subPlan = plan.subPlans.someObject;

  expect(subPlan.type).to.equal(superSchema.getType('SomeObject'));

  const iteration = subPlan.selectionsBySubschema.values().next();
  invariant(!iteration.done);

  const selections = iteration.value;
  expect(selections).to.deep.equal(
    parseSelectionSet('{ anotherField }').selections,
  );

  const anotherSubschemaPlan = plan.map.get(anotherSubschema);
  expect(anotherSubschemaPlan).to.equal(undefined);
});
