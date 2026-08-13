import type { QueryFunctionContext } from "@tanstack/react-query";

import {
  executeStaticGet,
  type GetTransportOptions,
  type StaticGetMethod,
} from "./execute.js";
import {
  TreatyQueryError,
  TreatyQueryErrorMappingError,
} from "./error.js";
import type { TreatyQueryErrorMapper } from "./error.js";
import { resolveCacheScope } from "./cache-scope.js";
import { createGetKey } from "./query-key.js";
import {
  createMutationOperation,
  isMutationMethodName,
  type MutationOperation,
} from "./mutation.js";
import {
  appendEscapedRouteProperty,
  appendRouteParameters,
  appendRouteProperty,
  routeSegment,
  resolveRouteMethod,
  type RouteParameters,
  type RouteSegment,
} from "./route.js";
import type {
  CacheScope,
  GetQueryOptions,
  GetQueryOptionsInput,
  SerializableValue,
  TreatyQueryKey,
  TreatyQuerySemanticInput,
} from "./types.js";

type Callable = (...arguments_: never[]) => unknown;
type UnsupportedTerminalMethod =
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

export type QueryError<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> = TMappedError extends Error
  ? TMappedError | TreatyQueryErrorMappingError
  : GetError<TMethod>;

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
  TMappedError extends Error | undefined = undefined,
> = GetQueryOptionsInput<
  GetData<TMethod>,
  QueryError<TMethod, TMappedError>,
  TData
> & {
  readonly request?: GetRequest<TMethod>;
  readonly cacheScope?: CacheScope | false;
};

type RequiresGetInput<TMethod> = MethodOptions<TMethod> extends {
  query: unknown;
}
  ? true
  : false;

export interface RequiredGetOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  queryOptions<TData = GetData<TMethod>>(
    input: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData, TMappedError>,
  ): GetQueryOptions<GetData<TMethod>, QueryError<TMethod, TMappedError>, TData>;
}

export interface OptionalGetOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  queryOptions<TData = GetData<TMethod>>(
    input?: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData, TMappedError>,
  ): GetQueryOptions<GetData<TMethod>, QueryError<TMethod, TMappedError>, TData>;
}

export type GetOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> = RequiresGetInput<TMethod> extends true
  ? RequiredGetOperation<TMethod, TMappedError>
  : OptionalGetOperation<TMethod, TMappedError>;

type RoutePropertyKey<TNode, TKey> = TKey extends string
  ? TKey extends "~path" | "then" | "catch" | "finally"
    ? never
    : TKey extends "get"
      ? TKey
      : TKey extends "post" | "put" | "patch" | "delete"
        ? TKey
      : TKey extends UnsupportedTerminalMethod
        ? never
        : TKey
  : never;

type HelperRouteProperties<
  TNode,
  TMappedError extends Error | undefined,
> = {
  readonly [TKey in keyof TNode as RoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? GetOperation<TNode[TKey], TMappedError>
      : TKey extends "post" | "put" | "patch" | "delete"
        ? MutationOperation<TNode[TKey], TMappedError>
      : TreatyQueryHelpers<TNode[TKey], TMappedError>;
};

type DynamicHelperRoute<TNode, TMappedError extends Error | undefined> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryHelpers<TResult, TMappedError>
  : unknown;

type EscapedHelperRoute<TNode, TMappedError extends Error | undefined> = {
  readonly [routeSegment]: <TKey extends keyof TNode & string>(
    segment: TKey,
  ) => TreatyQueryHelpers<TNode[TKey], TMappedError>;
};

export type TreatyQueryHelpers<
  TNode,
  TMappedError extends Error | undefined = undefined,
> =
  & DynamicHelperRoute<TNode, TMappedError>
  & EscapedHelperRoute<TNode, TMappedError>
  & HelperRouteProperties<TNode, TMappedError>;

function isRouteParameters(value: unknown): value is RouteParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "string" || typeof entry === "number",
  );
}

export function createGetOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
>(
  method: TMethod,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  inheritedCacheScope?: CacheScope,
  mapError?: TreatyQueryErrorMapper,
): GetOperation<TMethod, TMappedError> {
  if (typeof method !== "function") {
    throw new TypeError("Treaty route has no GET method.");
  }

  const getMethod = method as StaticGetMethod;
  const operation = Object.freeze({
    queryOptions<TData = GetData<TMethod>>(
      input?: GetInput<TMethod>,
      options: GetOperationOptions<TMethod, TData, TMappedError> = {},
    ): GetQueryOptions<
      GetData<TMethod>,
      QueryError<TMethod, TMappedError>,
      TData
    > {
      const semanticInput = input as TreatyQuerySemanticInput | undefined;
      const { request, cacheScope, ...tanstackOptions } = options;
      const resolvedScope = resolveCacheScope(
        inheritedCacheScope,
        cacheScope,
      );
      const queryKey = createGetKey(
        route,
        semanticInput,
        keyPrefix,
        resolvedScope,
      );
      const queryFn = async (
        context: QueryFunctionContext<TreatyQueryKey>,
      ): Promise<GetData<TMethod>> =>
        (await executeStaticGet(
          getMethod,
          context.signal,
          semanticInput,
          request as GetTransportOptions | undefined,
          mapError,
        )) as GetData<TMethod>;

      return {
        ...tanstackOptions,
        queryKey: queryKey as GetQueryOptions<
          GetData<TMethod>,
          QueryError<TMethod, TMappedError>,
          TData
        >["queryKey"],
        queryFn,
      };
    },
  });

  return operation as GetOperation<TMethod, TMappedError>;
}

function createRouteProxy(
  client: unknown,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  cacheScope: CacheScope | undefined,
  mapError: TreatyQueryErrorMapper | undefined,
): unknown {
  return new Proxy(function treatyQueryRoute(): void {}, {
    get(_target, property): unknown {
      if (property === routeSegment) {
        return (segment: string): unknown => {
          if (segment.length === 0) {
            throw new TypeError("An escaped Treaty route segment cannot be empty.");
          }

          return createRouteProxy(
            client,
            appendEscapedRouteProperty(route, segment),
            keyPrefix,
            cacheScope,
            mapError,
          );
        };
      }

      if (property === "then" || property === "catch" || property === "finally") {
        return undefined;
      }
      if (typeof property !== "string") return undefined;

      if (property === "get") {
        const method = resolveRouteMethod(client, route, "get");
        return createGetOperation(method, route, keyPrefix, cacheScope, mapError);
      }

      if (isMutationMethodName(property)) {
        const method = resolveRouteMethod(client, route, property);
        return createMutationOperation(method, property, route, keyPrefix, mapError);
      }

      return createRouteProxy(
        client,
        appendRouteProperty(route, property),
        keyPrefix,
        cacheScope,
        mapError,
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
        cacheScope,
        mapError,
      );
    },
  });
}

export function createTreatyQueryHelpers<
  TClient,
  TMappedError extends Error | undefined = undefined,
>(
  client: TClient,
  keyPrefix: readonly SerializableValue[] | undefined,
  cacheScope?: CacheScope,
  mapError?: TreatyQueryErrorMapper,
): TreatyQueryHelpers<TClient, TMappedError> {
  return createRouteProxy(
    client,
    [],
    keyPrefix,
    cacheScope,
    mapError,
  ) as TreatyQueryHelpers<TClient, TMappedError>;
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
