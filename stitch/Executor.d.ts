import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';
import type { FieldPlan } from './FieldPlan.js';
type Path = ReadonlyArray<string | number>;
interface GraphQLData {
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator;
}
interface Parent {
  [key: string | number]: unknown;
}
/**
 * @internal
 */
export declare class Executor {
  fieldPlan: FieldPlan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  constructor(
    fieldPlan: FieldPlan,
    operation: OperationDefinitionNode,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  );
  execute(): PromiseOrValue<ExecutionResult>;
  _createDocument(selections: Array<SelectionNode>): DocumentNode;
  subscribe(): PromiseOrValue<
    ExecutionResult | SimpleAsyncGenerator<ExecutionResult>
  >;
  _buildResponse(initialGraphQLData: GraphQLData): ExecutionResult;
  _handleMaybeAsyncResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: PromiseOrValue<ExecutionResult>,
    path: Path,
  ): void;
  _getSubFieldPlans(path: Path): ObjMap<FieldPlan> | undefined;
  _handleInitialResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult,
    path: Path,
  ): void;
  _executeSubFieldPlans(
    graphQLData: GraphQLData,
    fields: ObjMap<unknown>,
    subFieldPlans: ObjMap<FieldPlan>,
    path: Path,
  ): void;
  _executePossibleListSubFieldPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void;
  _executeSubFieldPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void;
  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
