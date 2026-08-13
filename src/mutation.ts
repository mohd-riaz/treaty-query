import type { MutationFunctionContext } from "@tanstack/react-query";

import {
  executeMutation,
  type MutationMethod,
  type MutationRequestOptions,
} from "./execute.js";
import { createMutationKey } from "./query-key.js";
import type { RouteSegment } from "./route.js";
import type { GetData, GetError } from "./static-helpers.js";
import type {
  MutationOptionsInput,
  SerializableValue,
  TreatyMutationKey,
  TreatyMutationMethod,
  TreatyMutationOptions,
} from "./types.js";

export type MutationMethodName = "post" | "put" | "patch" | "delete";

type MethodArgument<TMethod, TIndex extends number> = TMethod extends (
  ...arguments_: infer TArguments
) => unknown
  ? TIndex extends keyof TArguments
    ? TArguments[TIndex]
    : never
  : never;

type MutationMethodOptions<TMethod> = NonNullable<MethodArgument<TMethod, 1>>;

export type MutationBody<TMethod> = MethodArgument<TMethod, 0>;

type MutationFetch<TMethod> = MutationMethodOptions<TMethod> extends {
  fetch?: infer TFetch;
}
  ? TFetch
  : RequestInit;

export type MutationRequest<TMethod> = Omit<
  MutationMethodOptions<TMethod>,
  "fetch" | "throwHttpError"
> & {
  readonly fetch?: NonNullable<MutationFetch<TMethod>>;
};

type MutationRequestField<TMethod> =
  {} extends MutationRequest<TMethod>
    ? { readonly request?: MutationRequest<TMethod> }
    : { readonly request: MutationRequest<TMethod> };

export type MutationOperationOptions<
  TMethod,
  TOnMutateResult = unknown,
> = MutationOptionsInput<
  GetData<TMethod>,
  GetError<TMethod>,
  MutationBody<TMethod>,
  TOnMutateResult
> & MutationRequestField<TMethod>;

export type MutationData<TMethod> = GetData<TMethod>;
export type MutationError<TMethod> = GetError<TMethod>;

export type MutationFactoryResult<
  TMethod,
  TOnMutateResult = unknown,
> = TreatyMutationOptions<
  MutationData<TMethod>,
  MutationError<TMethod>,
  MutationBody<TMethod>,
  TOnMutateResult
>;

export interface RequiredMutationOperation<TMethod> {
  mutationOptions<TOnMutateResult = unknown>(
    options: MutationOperationOptions<TMethod, TOnMutateResult>,
  ): MutationFactoryResult<TMethod, TOnMutateResult>;
}

export interface OptionalMutationOperation<TMethod> {
  mutationOptions<TOnMutateResult = unknown>(
    options?: MutationOperationOptions<TMethod, TOnMutateResult>,
  ): MutationFactoryResult<TMethod, TOnMutateResult>;
}

export type MutationOperation<TMethod> =
  {} extends MutationRequest<TMethod>
    ? OptionalMutationOperation<TMethod>
    : RequiredMutationOperation<TMethod>;

export function isMutationMethodName(
  value: string,
): value is MutationMethodName {
  return value === "post" ||
    value === "put" ||
    value === "patch" ||
    value === "delete";
}

function toMutationMethod(method: MutationMethodName): TreatyMutationMethod {
  return method.toUpperCase() as TreatyMutationMethod;
}

export function createMutationOperation<TMethod>(
  treatyMethod: TMethod,
  method: MutationMethodName,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
): MutationOperation<TMethod> {
  if (typeof treatyMethod !== "function") {
    throw new TypeError(`Treaty route has no ${method.toUpperCase()} method.`);
  }

  const executableMethod = treatyMethod as MutationMethod;
  const operation = Object.freeze({
    mutationOptions<TOnMutateResult = unknown>(
      options: MutationOperationOptions<TMethod, TOnMutateResult> = {} as
        MutationOperationOptions<TMethod, TOnMutateResult>,
    ): MutationFactoryResult<TMethod, TOnMutateResult> {
      const { request, ...tanstackOptions } = options;
      const runtimeRequest = request as MutationRequestOptions | undefined;
      const mutationKey: TreatyMutationKey = createMutationKey(
        route,
        toMutationMethod(method),
        runtimeRequest?.query,
        keyPrefix,
      );

      const mutationFn = async (
        body: MutationBody<TMethod>,
        _context: MutationFunctionContext,
      ): Promise<MutationData<TMethod>> =>
        (await executeMutation(
          executableMethod,
          body,
          runtimeRequest,
        )) as MutationData<TMethod>;

      return {
        ...tanstackOptions,
        mutationKey,
        mutationFn,
      } as unknown as MutationFactoryResult<TMethod, TOnMutateResult>;
    },
  });

  return operation as MutationOperation<TMethod>;
}
