import { expect } from 'chai';
import type { GraphQLSchema, OperationDefinitionNode } from 'graphql';
import {
  buildSchema,
  execute,
  GraphQLError,
  OperationTypeNode,
  parse,
} from 'graphql';
import { describe, it } from 'mocha';

import { dedent } from '../../__testUtils__/dedent.js';

import { invariant } from '../../utilities/invariant.js';

import type { FieldPlan } from '../Planner.js';
import { Planner } from '../Planner.js';
import { printPlan } from '../printPlan.js';
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

function createFieldPlan(
  superSchema: SuperSchema,
  operation: OperationDefinitionNode,
): FieldPlan {
  const queryType = superSchema.getRootType(OperationTypeNode.QUERY);

  invariant(queryType !== undefined);

  const planner = new Planner(superSchema, operation, [], {}, []);

  const fieldPlan = planner.createRootFieldPlan();

  invariant(!(fieldPlan instanceof GraphQLError));

  return fieldPlan;
}

describe('FieldPlan', () => {
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

    const fieldPlan = createFieldPlan(superSchema, operation);

    expect(printPlan(fieldPlan)).to.equal(dedent`
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

    const fieldPlan = createFieldPlan(superSchema, operation);

    expect(printPlan(fieldPlan)).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField
              __stitching__typename: __typename
            }
          }
      StitchTree for 'someObject':
        Plan for type 'SomeObject':
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

    const fieldPlan = createFieldPlan(superSchema, operation);

    expect(printPlan(fieldPlan)).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField {
                someNestedField
                __stitching__typename: __typename
              }
              __stitching__typename: __typename
            }
          }
      StitchTree for 'someObject':
        Plan for type 'SomeObject':
          StitchTree for 'someField':
            Plan for type 'SomeNestedObject':
              Map:
                Subschema 1:
                  {
                    anotherNestedField
                  }
    `);
  });

  it('works to split sub-subfields when using inline fragments', () => {
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
        someObject {
          someField {
            someNestedField
          }
        }
        ... {
          someObject {
            ... {
              someField {
                ... {
                  anotherNestedField  
                }
              }
            }
          }
        }
      }`,
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const fieldPlan = createFieldPlan(superSchema, operation);

    expect(printPlan(fieldPlan)).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField {
                someNestedField
              }
            }
            ... {
              someObject {
                ... {
                  someField {
                    __stitching__typename: __typename
                  }
                }
                __stitching__typename: __typename
              }
            }
          }
      StitchTree for 'someObject':
        Plan for type 'SomeObject':
          StitchTree for 'someField':
            Plan for type 'SomeNestedObject':
              Map:
                Subschema 1:
                  {
                    anotherNestedField
                  }
    `);
  });

  it('works to split fields with subfields', () => {
    const someSchema = buildSchema(`
      type Query {
        someObject: SomeObject
      }

      type SomeObject {
        someField: SomeNestedObject
      }

      type SomeNestedObject {
        someField: String
      }
    `);

    const anotherSchema = buildSchema(`
      type Query {
        someObject: SomeObject
      }

      type SomeObject {
        anotherField: AnotherNestedObject
      }

      type AnotherNestedObject {
        someField: String
      }
    `);

    const someSubschema = getSubschema(someSchema);
    const anotherSubschema = getSubschema(anotherSchema);
    const superSchema = new SuperSchema([someSubschema, anotherSubschema]);

    const operation = parse(
      `{
        someObject {
          someField { someField }
          anotherField { someField }
        }
      }`,
      { noLocation: true },
    ).definitions[0] as OperationDefinitionNode;

    const fieldPlan = createFieldPlan(superSchema, operation);

    expect(printPlan(fieldPlan)).to.equal(dedent`
      Map:
        Subschema 0:
          {
            someObject {
              someField {
                someField
              }
              anotherField {
                __stitching__typename: __typename
              }
              __stitching__typename: __typename
            }
          }
      StitchTree for 'someObject':
        Plan for type 'SomeObject':
          Map:
            Subschema 1:
              {
                anotherField {
                  someField
                }
              }
    `);
  });
});
