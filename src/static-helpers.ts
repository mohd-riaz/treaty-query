import type { QueryFunctionContext } from "@tanstack/react-query";

import { executeStaticGet, type StaticGetMethod } from "./execute.js";
import { createStaticGetKey } from "./query-key.js";
import { TreatyQueryError } from "./error.js";
import type {
  SerializableValue,
  StaticGetQueryOptions,
  StaticGetQueryOptionsInput,
  TreatyQueryKey,
} from "./types.js";

type Callable = (...arguments_: never[]) => unknown;

type MethodResult<TMethod> = TMethod extends (
  ...arguments_: infer _TArguments
) => infer TResult
  ? Awaited<TResult>
  : never;

type SuccessResult<TResult> = Extract<TResult, { readonly error: null }>;
export type StaticGetData<TMethod> = SuccessResult<MethodResult<TMethod>> extends {
  readonly data: infer TData;
}
  ? TData extends undefined
    ? null
    : TData
  : never;

type ErrorResult<TResult> = Exclude<TResult, { readonly error: null }>;
type ErrorValue<TMethod> = ErrorResult<MethodResult<TMethod>> extends {
  readonly error: infer TError;
}
  ? TError
  : never;

type DeclaredTreatyQueryError<TError> = TError extends {
  readonly status: infer TStatus extends number;
  readonly value: infer TValue;
}
  ? number extends TStatus
    ? never
    : TreatyQueryError<TStatus, TValue>
  : never;

export type StaticGetError<TMethod> =
  | DeclaredTreatyQueryError<ErrorValue<TMethod>>
  | TreatyQueryError<503, unknown>;

type AcceptsNoArguments<TMethod> = TMethod extends Callable
  ? [] extends Parameters<TMethod>
    ? true
    : false
  : false;

type StaticHelperKey<TNode, TKey> = TKey extends string
  ? TKey extends "~path"
    ? never
    : TKey extends "get"
      ? AcceptsNoArguments<TNode extends Record<TKey, unknown> ? TNode[TKey] : never> extends true
        ? TKey
        : never
      : TNode extends Record<TKey, unknown>
        ? TNode[TKey] extends Callable
          ? never
          : TKey
        : never
  : never;

export interface StaticGetOperation<TMethod> {
  queryOptions<TData = StaticGetData<TMethod>>(
    options?: StaticGetQueryOptionsInput<
      StaticGetData<TMethod>,
      StaticGetError<TMethod>,
      TData
    >,
  ): StaticGetQueryOptions<
    StaticGetData<TMethod>,
    StaticGetError<TMethod>,
    TData
  >;
}

export type StaticTreatyQueryHelpers<TNode> = {
  readonly [TKey in keyof TNode as StaticHelperKey<TNode, TKey>]:
    TKey extends "get"
      ? StaticGetOperation<TNode[TKey]>
      : StaticTreatyQueryHelpers<TNode[TKey]>;
};

function readProperty(value: unknown, property: string): unknown {
  return (value as Record<string, unknown>)[property];
}

export function createStaticGetOperation<TMethod>(
  method: TMethod,
  path: readonly string[],
  keyPrefix: readonly SerializableValue[] | undefined,
): StaticGetOperation<TMethod> {
  if (typeof method !== "function") {
    throw new TypeError(`Treaty route /${path.join("/")} has no GET method.`);
  }

  const queryKey = createStaticGetKey(path, keyPrefix);
  const staticGetMethod = method as StaticGetMethod;

  return Object.freeze({
    queryOptions<TData = StaticGetData<TMethod>>(
      options: StaticGetQueryOptionsInput<
        StaticGetData<TMethod>,
        StaticGetError<TMethod>,
        TData
      > = {},
    ): StaticGetQueryOptions<
      StaticGetData<TMethod>,
      StaticGetError<TMethod>,
      TData
    > {
      const queryFn = async (
        context: QueryFunctionContext<TreatyQueryKey>,
      ): Promise<StaticGetData<TMethod>> =>
        (await executeStaticGet(
          staticGetMethod,
          context.signal,
        )) as StaticGetData<TMethod>;

      return {
        ...options,
        queryKey: queryKey as StaticGetQueryOptions<
          StaticGetData<TMethod>,
          StaticGetError<TMethod>,
          TData
        >["queryKey"],
        queryFn,
      };
    },
  });
}

function createRouteProxy(
  clientNode: unknown,
  path: readonly string[],
  keyPrefix: readonly SerializableValue[] | undefined,
): unknown {
  return new Proxy(Object.create(null) as object, {
    get(_target, property): unknown {
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;

      const nextClientNode = readProperty(clientNode, property);

      if (property === "get" && typeof nextClientNode === "function") {
        return createStaticGetOperation(nextClientNode, path, keyPrefix);
      }

      return createRouteProxy(nextClientNode, [...path, property], keyPrefix);
    },
  });
}

export function createStaticHelpers<TClient>(
  client: TClient,
  keyPrefix: readonly SerializableValue[] | undefined,
): StaticTreatyQueryHelpers<TClient> {
  return createRouteProxy(client, [], keyPrefix) as StaticTreatyQueryHelpers<TClient>;
}
