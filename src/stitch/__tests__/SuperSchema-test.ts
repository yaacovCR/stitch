import { expect } from 'chai';
import type {
  GraphQLObjectType,
  GraphQLSchema,
  OperationDefinitionNode,
} from 'graphql';
import {
  buildSchema,
  execute,
  GraphQLString,
  OperationTypeNode,
  parse,
} from 'graphql';
import { describe, it } from 'mocha';

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
        anotherObject { anotherField }
      }`,
      { noLocation: true },
    );

    const splitDocuments = superSchema.splitDocument(
      createOperationContext(
        superSchema,
        operation.definitions[0] as OperationDefinitionNode,
      ),
    );

    const someSchemaOperation = splitDocuments.get(someSubschema);
    expect(someSchemaOperation).to.deep.equal(
      parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ),
    );

    const anotherSchemaOperation = splitDocuments.get(anotherSubschema);
    expect(anotherSchemaOperation).to.deep.equal(
      parse(
        `{
          anotherObject { anotherField }
        }`,
        { noLocation: true },
      ),
    );
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
        anotherObject { anotherField }
      }`,
      { noLocation: true },
    );

    const splitDocuments = superSchema.splitDocument(
      createOperationContext(
        superSchema,
        operation.definitions[0] as OperationDefinitionNode,
      ),
    );

    const mergedSubschema = splitDocuments.keys().next().value as Subschema;
    const mergedSchemaOperation = splitDocuments.get(mergedSubschema);
    expect(mergedSchemaOperation).to.deep.equal(
      parse(
        `{
          __schema { queryType { name } }
          __type(name: "Query") { name }
        }`,
        { noLocation: true },
      ),
    );

    const someSchemaOperation = splitDocuments.get(someSubschema);
    expect(someSchemaOperation).to.deep.equal(
      parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ),
    );

    const anotherSchemaOperation = splitDocuments.get(anotherSubschema);
    expect(anotherSchemaOperation).to.deep.equal(
      parse(
        `{
          anotherObject { anotherField }
        }`,
        { noLocation: true },
      ),
    );
  });
});
