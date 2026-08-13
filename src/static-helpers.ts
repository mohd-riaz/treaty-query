import type { QueryFunctionContext } from "@tanstack/react-query";

import {
  executeStaticGet,
  type GetTransportOptions,
  type StaticGetMethod,
} from "./execute.js";
import { TreatyQueryError } from "./error.js";
import { createGetKey } from "./query-key.js";
import {
  appendRouteParameters,
  appendRouteProperty,
  resolveRouteMethod,
  type RouteParameters,
  type RouteSegment,
} from "./route.js";
import type {
  GetQueryOptions,
  GetQueryOptionsInput,
  SerializableValue,
  TreatyQueryKey,
  TreatyQuerySemanticInput,
} from "./types.js";

type Callable = (...arguments_: never[]) => unknown;
type NonGetTerminalMethod =
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "connect"
  | "subscribe";

type MethodResult<TMethod> = TMethod extends (
  ...arguments_: infer _TArguments
) => infer TResult
  ? Awaited<TResult>
  : never;

type SuccessResult<TResult> = Extract<TResult, { readonly error: null }>;
export type GetData<TMethod> = SuccessResult<MethodResult<TMethod>> extends {
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

export type GetError<TMethod> =
  | DeclaredTreatyQueryError<ErrorValue<TMethod>>
  | TreatyQueryError<503, unknown>;

type MethodOptions<TMethod> = TMethod extends (
  options: infer TOptions,
  ...arguments_: infer _TRest
) => unknown
  ? NonNullable<TOptions>
  : never;

export type GetInput<TMethod> = MethodOptions<TMethod> extends {
  query: infer TQuery;
}
  ? { readonly query: TQuery }
  : MethodOptions<TMethod> extends { query?: infer TQuery }
    ? { readonly query?: TQuery }
    : undefined;

type MethodFetch<TMethod> = MethodOptions<TMethod> extends {
  fetch?: infer TFetch;
}
  ? TFetch
  : RequestInit;

type MethodHeaders<TMethod> = MethodOptions<TMethod> extends {
  headers?: infer THeaders;
}
  ? THeaders
  : unknown;

export interface GetRequest<TMethod> {
  readonly headers?: MethodHeaders<TMethod>;
  readonly fetch?: Omit<NonNullable<MethodFetch<TMethod>>, "signal">;
}

export type GetOperationOptions<
  TMethod,
  TData = GetData<TMethod>,
> = GetQueryOptionsInput<GetData<TMethod>, GetError<TMethod>, TData> & {
  readonly request?: GetRequest<TMethod>;
};

type RequiresGetInput<TMethod> = MethodOptions<TMethod> extends {
  query: unknown;
}
  ? true
  : false;

export interface RequiredGetOperation<TMethod> {
  queryOptions<TData = GetData<TMethod>>(
    input: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData>,
  ): GetQueryOptions<GetData<TMethod>, GetError<TMethod>, TData>;
}

export interface OptionalGetOperation<TMethod> {
  queryOptions<TData = GetData<TMethod>>(
    input?: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData>,
  ): GetQueryOptions<GetData<TMethod>, GetError<TMethod>, TData>;
}

export type GetOperation<TMethod> = RequiresGetInput<TMethod> extends true
  ? RequiredGetOperation<TMethod>
  : OptionalGetOperation<TMethod>;

type RoutePropertyKey<TNode, TKey> = TKey extends string
  ? TKey extends "~path"
    ? never
    : TKey extends "get"
      ? TKey
      : TKey extends NonGetTerminalMethod
        ? never
        : TKey
  : never;

type HelperRouteProperties<TNode> = {
  readonly [TKey in keyof TNode as RoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? GetOperation<TNode[TKey]>
      : TreatyQueryHelpers<TNode[TKey]>;
};

type DynamicHelperRoute<TNode> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryHelpers<TResult>
  : unknown;

export type TreatyQueryHelpers<TNode> =
  & DynamicHelperRoute<TNode>
  & HelperRouteProperties<TNode>;

function isRouteParameters(value: unknown): value is RouteParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "string" || typeof entry === "number",
  );
}

export function createGetOperation<TMethod>(
  method: TMethod,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
): GetOperation<TMethod> {
  if (typeof method !== "function") {
    throw new TypeError("Treaty route has no GET method.");
  }

  const getMethod = method as StaticGetMethod;
  const operation = Object.freeze({
    queryOptions<TData = GetData<TMethod>>(
      input?: GetInput<TMethod>,
      options: GetOperationOptions<TMethod, TData> = {},
    ): GetQueryOptions<GetData<TMethod>, GetError<TMethod>, TData> {
      const semanticInput = input as TreatyQuerySemanticInput | undefined;
      const { request, ...tanstackOptions } = options;
      const queryKey = createGetKey(route, semanticInput, keyPrefix);
      const queryFn = async (
        context: QueryFunctionContext<TreatyQueryKey>,
      ): Promise<GetData<TMethod>> =>
        (await executeStaticGet(
          getMethod,
          context.signal,
          semanticInput,
          request as GetTransportOptions | undefined,
        )) as GetData<TMethod>;

      return {
        ...tanstackOptions,
        queryKey: queryKey as GetQueryOptions<
          GetData<TMethod>,
          GetError<TMethod>,
          TData
        >["queryKey"],
        queryFn,
      };
    },
  });

  return operation as GetOperation<TMethod>;
}

function createRouteProxy(
  client: unknown,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
): unknown {
  return new Proxy(function treatyQueryRoute(): void {}, {
    get(_target, property): unknown {
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;

      if (property === "get") {
        const method = resolveRouteMethod(client, route, "get");
        return createGetOperation(method, route, keyPrefix);
      }

      return createRouteProxy(
        client,
        appendRouteProperty(route, property),
        keyPrefix,
      );
    },
    apply(_target, _thisArgument, argumentsList): unknown {
      const parameters = argumentsList[0];

      if (argumentsList.length !== 1 || !isRouteParameters(parameters)) {
        throw new TypeError(
          "Treaty dynamic routes require one string-or-number parameter object.",
        );
      }

      return createRouteProxy(
        client,
        appendRouteParameters(route, parameters),
        keyPrefix,
      );
    },
  });
}

export function createTreatyQueryHelpers<TClient>(
  client: TClient,
  keyPrefix: readonly SerializableValue[] | undefined,
): TreatyQueryHelpers<TClient> {
  return createRouteProxy(client, [], keyPrefix) as TreatyQueryHelpers<TClient>;
}

/** @deprecated Use `GetData`. */
export type StaticGetData<TMethod> = GetData<TMethod>;
/** @deprecated Use `GetError`. */
export type StaticGetError<TMethod> = GetError<TMethod>;
/** @deprecated Use `GetOperation`. */
export type StaticGetOperation<TMethod> = GetOperation<TMethod>;
/** @deprecated Use `TreatyQueryHelpers`. */
export type StaticTreatyQueryHelpers<TNode> = TreatyQueryHelpers<TNode>;
/** @deprecated Use `createGetOperation`. */
export const createStaticGetOperation: typeof createGetOperation = createGetOperation;
/** @deprecated Use `createTreatyQueryHelpers`. */
export const createStaticHelpers: typeof createTreatyQueryHelpers =
  createTreatyQueryHelpers;
