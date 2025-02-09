import type { ExecutionResult } from 'graphql';
import type { PromiseOrValue } from '../types/PromiseOrValue.js';
import type { SubschemaPlan } from './Planner.js';
import type { SuperSchema } from './SuperSchema.js';
export interface SubschemaPlanResult {
    subschemaPlan: SubschemaPlan;
    initialResult: PromiseOrValue<ExecutionResult>;
}
export declare function compose(subschemaPlanResults: Array<SubschemaPlanResult>, superSchema: SuperSchema, rawVariableValues: {
    readonly [variable: string]: unknown;
} | undefined): PromiseOrValue<ExecutionResult>;
