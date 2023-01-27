import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import { buildSchema, execute, parse } from 'graphql';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';
import { parseSelectionSet } from '../../utilities/parseSelectionSet.js';

import { Plan } from '../Plan.js';
import type { OperationContext, Subschema } from '../SuperSchema.js';
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

function createOperationContext(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): OperationContext {
  return {
    superSchema,
    operation,
    fragments: [],
    fragmentMap: {},
    variableDefinitions: [],
  };
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
    );

    const plan = new Plan(
      superSchema,
      createOperationContext(
        superSchema,
        operation.definitions[0] as OperationDefinitionNode,
      ),
    );

    const iteration = plan.map.keys().next();
    invariant(!iteration.done);

    const mergedSubschema = iteration.value;
    const mergedSubschemaDocument = plan.map.get(mergedSubschema);
    expect(mergedSubschemaDocument).to.deep.equal(
      parse(
        `{
          __schema { queryType { name } }
          __type(name: "Query") { name }
        }`,
        { noLocation: true },
      ),
    );

    const someSubschemaDocument = plan.map.get(someSubschema);
    expect(someSubschemaDocument).to.deep.equal(
      parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ),
    );

    const anotherSubschemaDocument = plan.map.get(anotherSubschema);
    expect(anotherSubschemaDocument).to.deep.equal(
      parse(
        `{
          anotherObject { someField }
        }`,
        { noLocation: true },
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
  );

  const plan = new Plan(
    superSchema,
    createOperationContext(
      superSchema,
      operation.definitions[0] as OperationDefinitionNode,
    ),
  );

  const someSubschemaDocument = plan.map.get(someSubschema);
  expect(someSubschemaDocument).to.deep.equal(
    parse(
      `{
        someObject { someField }
      }`,
      { noLocation: true },
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
