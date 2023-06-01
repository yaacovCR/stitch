import type { Push } from '@repeaterjs/repeater';
import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  OperationDefinitionNode,
  SelectionNode,
  SubsequentIncrementalExecutionResult,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SimpleAsyncGenerator } from '../types/SimpleAsyncGenerator.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';
import type { Plan } from './Plan.js';
type Path = ReadonlyArray<string | number>;
interface GraphQLData {
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator<
    ExecutionResult,
    GraphQLError,
    ExecutionResult
  >;
}
interface Parent {
  [key: string | number]: unknown;
}
/**
 * @internal
 */
export declare class Executor {
  plan: Plan;
  operation: OperationDefinitionNode;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  constructor(
    plan: Plan,
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
  _push(
    incrementalResult: SubsequentIncrementalExecutionResult,
    push: Push<SubsequentIncrementalExecutionResult>,
  ): void;
  _getSubPlans(path: Path): ObjMap<Plan> | undefined;
  _handleInitialResult(
    graphQLData: GraphQLData,
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult,
    path: Path,
  ): void;
  _executeSubPlans(
    graphQLData: GraphQLData,
    fields: ObjMap<unknown>,
    subPlans: ObjMap<Plan>,
    path: Path,
  ): void;
  _executePossibleListSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    plan: Plan,
    path: Path,
  ): void;
  _executeSubPlan(
    graphQLData: GraphQLData,
    parent: Parent,
    fields: ObjMap<unknown>,
    plan: Plan,
    path: Path,
  ): void;
  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void;
  _handlePossibleStream<
    T extends ExecutionResult | SimpleAsyncGenerator<ExecutionResult>,
  >(result: T): PromiseOrValue<T>;
}
export {};
