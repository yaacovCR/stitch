import { expect } from 'chai';
import type {
  GraphQLObjectType,
  GraphQLSchema,
  OperationDefinitionNode,
  SelectionNode,
} from 'graphql';
import {
  buildSchema,
  execute,
  GraphQLString,
  OperationTypeNode,
  parse,
} from 'graphql';
import { describe, it } from 'mocha';

import { invariant } from '../../utilities/invariant.js';

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

describe('SuperSchema', () => {
  it('works to combine root fields', () => {
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

    const queryType = superSchema.getRootType(OperationTypeNode.QUERY);
    expect(queryType).to.deep.include({
      name: 'Query',
    });
    expect(queryType?.getFields().someObject).to.deep.include({
      type: superSchema.getType('SomeObject'),
    });
    expect(queryType?.getFields().anotherObject).to.deep.include({
      type: superSchema.getType('AnotherObject'),
    });
  });

  it('works to combine object fields', () => {
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

    const someObjectType = superSchema.getType('SomeObject') as
      | GraphQLObjectType
      | undefined;
    expect(someObjectType).to.deep.include({
      name: 'SomeObject',
    });
    expect(someObjectType?.getFields().someField).to.deep.include({
      type: GraphQLString,
    });
    expect(someObjectType?.getFields().anotherField).to.deep.include({
      type: GraphQLString,
    });
  });

  it('works to split root fields', () => {
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
        someObject { someField }
        anotherObject { someField }
      }`,
      { noLocation: true },
    );

    const plan = superSchema.generatePlan(
      createOperationContext(
        superSchema,
        operation.definitions[0] as OperationDefinitionNode,
      ),
    );

    const someSubschemaPlan = plan.get(someSubschema);
    expect(someSubschemaPlan).to.deep.equal({
      document: parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ),
      subPlans: {},
    });

    const anotherSubschemaPlan = plan.get(anotherSubschema);
    expect(anotherSubschemaPlan).to.deep.equal({
      document: parse(
        `{
          anotherObject { someField }
        }`,
        { noLocation: true },
      ),
      subPlans: {},
    });
  });

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

    const plan = superSchema.generatePlan(
      createOperationContext(
        superSchema,
        operation.definitions[0] as OperationDefinitionNode,
      ),
    );

    const mergedSubschema = plan.keys().next().value as Subschema;
    const mergedSubschemaPlan = plan.get(mergedSubschema);
    expect(mergedSubschemaPlan).to.deep.equal({
      document: parse(
        `{
          __schema { queryType { name } }
          __type(name: "Query") { name }
        }`,
        { noLocation: true },
      ),
      subPlans: {},
    });

    const someSubschemaPlan = plan.get(someSubschema);
    expect(someSubschemaPlan).to.deep.equal({
      document: parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ),
      subPlans: {},
    });

    const anotherSubschemaPlan = plan.get(anotherSubschema);
    expect(anotherSubschemaPlan).to.deep.equal({
      document: parse(
        `{
          anotherObject { someField }
        }`,
        { noLocation: true },
      ),
      subPlans: {},
    });
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

  const plan = superSchema.generatePlan(
    createOperationContext(
      superSchema,
      operation.definitions[0] as OperationDefinitionNode,
    ),
  );

  const someSubschemaPlan = plan.get(someSubschema);
  invariant(someSubschemaPlan !== undefined);
  expect(someSubschemaPlan.document).to.deep.equal(
    parse(
      `{
        someObject { someField }
      }`,
      { noLocation: true },
    ),
  );

  const subPlan = someSubschemaPlan.subPlans.someObject;

  expect(subPlan.type).to.equal(superSchema.getType('SomeObject'));

  const selections = subPlan.selectionsBySubschema.values().next()
    .value as Array<SelectionNode>;
  expect(selections).to.deep.equal(
    (
      parse('{ anotherField }', { noLocation: true })
        .definitions[0] as OperationDefinitionNode
    ).selectionSet.selections,
  );

  const anotherSubschemaPlan = plan.get(anotherSubschema);
  expect(anotherSubschemaPlan).to.equal(undefined);
});
