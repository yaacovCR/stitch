import { expect } from 'chai';
import type { GraphQLObjectType, OperationDefinitionNode } from 'graphql';
import { buildSchema, GraphQLString, OperationTypeNode, parse } from 'graphql';
import { describe, it } from 'mocha';

import { SuperSchema } from '../SuperSchema.js';

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

    const superSchema = new SuperSchema([someSchema, anotherSchema]);

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

    const superSchema = new SuperSchema([someSchema, anotherSchema]);

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

    const superSchema = new SuperSchema([someSchema, anotherSchema]);

    const operation = parse(
      `{
        someObject { someField }
        anotherObject { anotherField }
      }`,
      { noLocation: true },
    );

    const splitOperations = superSchema.splitOperation(
      operation.definitions[0] as OperationDefinitionNode,
    );

    const someSchemaOperation = splitOperations.get(someSchema);
    expect(someSchemaOperation).to.deep.equal(
      parse(
        `{
          someObject { someField }
        }`,
        { noLocation: true },
      ).definitions[0],
    );

    const anotherSchemaOperation = splitOperations.get(anotherSchema);
    expect(anotherSchemaOperation).to.deep.equal(
      parse(
        `{
          anotherObject { anotherField }
        }`,
        { noLocation: true },
      ).definitions[0],
    );
  });
});
