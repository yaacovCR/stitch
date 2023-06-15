import type {
  DocumentNode,
  ExecutionResult,
  FragmentDefinitionNode,
  SelectionNode,
} from 'graphql';
import { GraphQLError } from 'graphql';
import type { ObjMap } from '../types/ObjMap.js';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import { PromiseAggregator } from '../utilities/PromiseAggregator.js';
import type { FieldPlan } from './FieldPlan.js';
type Path = ReadonlyArray<string | number>;
interface Parent {
  [key: string | number]: unknown;
}
/**
 * @internal
 */
export declare class Composer {
  results: Array<PromiseOrValue<ExecutionResult>>;
  fieldPlan: FieldPlan;
  fragments: ReadonlyArray<FragmentDefinitionNode>;
  rawVariableValues:
    | {
        readonly [variable: string]: unknown;
      }
    | undefined;
  fields: ObjMap<unknown>;
  errors: Array<GraphQLError>;
  nulled: boolean;
  promiseAggregator: PromiseAggregator;
  constructor(
    results: Array<PromiseOrValue<ExecutionResult>>,
    fieldPlan: FieldPlan,
    fragments: ReadonlyArray<FragmentDefinitionNode>,
    rawVariableValues:
      | {
          readonly [variable: string]: unknown;
        }
      | undefined,
  );
  compose(): PromiseOrValue<ExecutionResult>;
  _createDocument(selections: Array<SelectionNode>): DocumentNode;
  _buildResponse(): ExecutionResult;
  _handleMaybeAsyncResult(
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: PromiseOrValue<ExecutionResult>,
    path: Path,
  ): void;
  _handleResult(
    parent: Parent | undefined,
    fields: ObjMap<unknown>,
    result: ExecutionResult,
    path: Path,
  ): void;
  _executeSubFieldPlans(
    fields: ObjMap<unknown>,
    subFieldPlans: ObjMap<FieldPlan>,
    path: Path,
  ): void;
  _executePossibleListSubFieldPlan(
    parent: Parent,
    fieldsOrList: ObjMap<unknown> | Array<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void;
  _executeSubFieldPlan(
    parent: Parent,
    fields: ObjMap<unknown>,
    fieldPlan: FieldPlan,
    path: Path,
  ): void;
  _deepMerge(fields: ObjMap<unknown>, key: string, value: unknown): void;
}
export {};
