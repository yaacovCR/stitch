import { expect } from 'chai';
import type { GraphQLObjectType, GraphQLSchema } from 'graphql';
import {
  buildSchema,
  execute,
  GraphQLString,
  OperationTypeNode,
} from 'graphql';
import { describe, it } from 'mocha';

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
});
