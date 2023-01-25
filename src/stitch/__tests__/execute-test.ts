import { expect } from 'chai';
import type { GraphQLSchema } from 'graphql';
import { buildSchema, execute as graphQLExecute, parse } from 'graphql';
import { describe, it } from 'mocha';

import { execute } from '../execute.js';
import type { Subschema } from '../SuperSchema.js';

function getSubschema(schema: GraphQLSchema, rootValue: unknown): Subschema {
  return {
    schema,
    executor: (args) =>
      graphQLExecute({
        ...args,
        schema,
        rootValue,
      }),
  };
}

describe('execute', () => {
  it('works to route root fields', () => {
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

    const result = execute({
      subschemas: [someSubschema, anotherSubschema],
      document: parse(
        ' { someObject { someField } anotherObject { someField } } ',
      ),
    });

    expect(result).to.deep.equal({
      data: {
        someObject: { someField: 'someField' },
        anotherObject: { someField: 'someField' },
      },
    });
  });
});
