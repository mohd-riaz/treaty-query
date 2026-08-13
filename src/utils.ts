import type {
  EnsureQueryDataOptions,
  InvalidateOptions as TanStackInvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  SetDataOptions,
  Updater,
} from "@tanstack/react-query";

import {
  removeCacheScopeQueries,
  resolveCacheScope,
} from "./cache-scope.js";
import {
  createGetKey,
  createGetMethodKey,
  createKeyPrefix,
  createRouteKey,
} from "./query-key.js";
import type { TreatyQueryErrorMapper } from "./error.js";
import {
  appendEscapedRouteProperty,
  appendRouteParameters,
  appendRouteProperty,
  routeSegment,
  resolveRouteMethod,
  type RouteParameters,
  type RouteSegment,
} from "./route.js";
import {
  createGetOperation,
  type GetData,
  type GetError,
  type GetInput,
  type GetOperationOptions,
  type QueryError,
} from "./static-helpers.js";
import type {
  CacheScope,
  SerializableValue,
  TreatyQueryKey,
  TreatyQueryRouteKey,
  TreatyQuerySemanticInput,
} from "./types.js";

type UnsupportedTerminalMethod =
  | "options"
  | "head"
  | "connect"
  | "subscribe"
  | "post"
  | "put"
  | "patch"
  | "delete";

type MethodOptions<TMethod> = TMethod extends (
  options: infer TOptions,
  ...arguments_: infer _TRest
) => unknown
  ? NonNullable<TOptions>
  : never;

type RequiresGetInput<TMethod> = MethodOptions<TMethod> extends {
  query: unknown;
}
  ? true
  : false;

export interface CacheUtilityScopeOptions {
  readonly cacheScope?: CacheScope | false;
}

export type TreatyInvalidateOptions = CacheUtilityScopeOptions &
  Omit<
    InvalidateQueryFilters<TreatyQueryKey>,
    "exact" | "predicate" | "queryKey"
  > &
  TanStackInvalidateOptions;

export type TreatyEnsureDataOptions<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> = CacheUtilityScopeOptions &
  Omit<
    EnsureQueryDataOptions<
      GetData<TMethod>,
      QueryError<TMethod, TMappedError>,
      GetData<TMethod>,
      TreatyQueryKey
    >,
    "queryFn" | "queryKey"
  > & {
    readonly request?: NonNullable<
      GetOperationOptions<TMethod, GetData<TMethod>, TMappedError>["request"]
    >;
  };

export type TreatySetDataOptions = CacheUtilityScopeOptions & SetDataOptions;

export interface TreatyRouteUtilities {
  queryKey(options?: CacheUtilityScopeOptions): TreatyQueryRouteKey;
  invalidate(options?: TreatyInvalidateOptions): Promise<void>;
}

export interface RequiredGetUtilities<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  queryKey(
    input: GetInput<TMethod>,
    options?: CacheUtilityScopeOptions,
  ): TreatyQueryKey;
  invalidate(options?: TreatyInvalidateOptions): Promise<void>;
  getData(
    input: GetInput<TMethod>,
    options?: CacheUtilityScopeOptions,
  ): GetData<TMethod> | undefined;
  setData(
    input: GetInput<TMethod>,
    updater: Updater<
      GetData<TMethod> | undefined,
      GetData<TMethod> | undefined
    >,
    options?: TreatySetDataOptions,
  ): GetData<TMethod> | undefined;
  ensureData(
    input: GetInput<TMethod>,
    options?: TreatyEnsureDataOptions<TMethod, TMappedError>,
  ): Promise<GetData<TMethod>>;
}

export interface OptionalGetUtilities<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  queryKey(
    input?: GetInput<TMethod>,
    options?: CacheUtilityScopeOptions,
  ): TreatyQueryKey;
  invalidate(options?: TreatyInvalidateOptions): Promise<void>;
  getData(
    input?: GetInput<TMethod>,
    options?: CacheUtilityScopeOptions,
  ): GetData<TMethod> | undefined;
  setData(
    updater: Updater<
      GetData<TMethod> | undefined,
      GetData<TMethod> | undefined
    >,
  ): GetData<TMethod> | undefined;
  setData(
    input: GetInput<TMethod> | undefined,
    updater: Updater<
      GetData<TMethod> | undefined,
      GetData<TMethod> | undefined
    >,
    options?: TreatySetDataOptions,
  ): GetData<TMethod> | undefined;
  ensureData(
    input?: GetInput<TMethod>,
    options?: TreatyEnsureDataOptions<TMethod, TMappedError>,
  ): Promise<GetData<TMethod>>;
}

export type GetUtilities<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> = RequiresGetInput<TMethod> extends true
  ? RequiredGetUtilities<TMethod, TMappedError>
  : OptionalGetUtilities<TMethod, TMappedError>;

type UtilityRoutePropertyKey<TNode, TKey> = TKey extends string
  ? TKey extends
    | "~path"
    | "then"
    | "catch"
    | "finally"
    | "queryKey"
    | "invalidate"
    | UnsupportedTerminalMethod
    ? never
    : TKey
  : never;

type UtilityRouteProperties<TNode, TMappedError extends Error | undefined> = {
  readonly [TKey in keyof TNode as UtilityRoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? GetUtilities<TNode[TKey], TMappedError>
      : TreatyQueryRouteUtilitiesFor<TNode[TKey], TMappedError>;
};

type DynamicUtilityRoute<TNode, TMappedError extends Error | undefined> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryRouteUtilitiesFor<TResult, TMappedError>
  : unknown;

type EscapedUtilityRoute<TNode, TMappedError extends Error | undefined> = {
  readonly [routeSegment]: <TKey extends keyof TNode & string>(
    segment: TKey,
  ) => TreatyQueryRouteUtilitiesFor<TNode[TKey], TMappedError>;
};

export type TreatyQueryRouteUtilitiesFor<
  TNode,
  TMappedError extends Error | undefined = undefined,
> =
  & TreatyRouteUtilities
  & DynamicUtilityRoute<TNode, TMappedError>
  & EscapedUtilityRoute<TNode, TMappedError>
  & UtilityRouteProperties<TNode, TMappedError>;

export type TreatyQueryUtils<
  TNode,
  TMappedError extends Error | undefined = undefined,
> = TreatyQueryRouteUtilitiesFor<TNode, TMappedError> & {
  removeCacheScope(scope: CacheScope): void;
};

function isRouteParameters(value: unknown): value is RouteParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "string" || typeof entry === "number",
  );
}

function splitInvalidateOptions(
  options: TreatyInvalidateOptions | undefined,
): {
  readonly cacheScope: CacheScope | false | undefined;
  readonly filters: Omit<
    InvalidateQueryFilters<TreatyQueryKey>,
    "exact" | "predicate" | "queryKey"
  >;
  readonly invalidateOptions: TanStackInvalidateOptions;
} {
  if (options === undefined) {
    return {
      cacheScope: undefined,
      filters: {},
      invalidateOptions: {},
    };
  }

  const {
    cacheScope,
    cancelRefetch,
    throwOnError,
    ...filters
  } = options;

  return {
    cacheScope,
    filters,
    invalidateOptions: {
      ...(cancelRefetch === undefined ? {} : { cancelRefetch }),
      ...(throwOnError === undefined ? {} : { throwOnError }),
    },
  };
}

function createGetUtilities(
  client: unknown,
  queryClient: QueryClient,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  inheritedCacheScope: CacheScope | undefined,
  mapError: TreatyQueryErrorMapper | undefined,
): unknown {
  const getMethod = resolveRouteMethod(client, route, "get");

  return Object.freeze({
    queryKey(
      input?: TreatyQuerySemanticInput,
      options?: CacheUtilityScopeOptions,
    ): TreatyQueryKey {
      return createGetKey(
        route,
        input,
        keyPrefix,
        resolveCacheScope(inheritedCacheScope, options?.cacheScope),
      );
    },
    async invalidate(options?: TreatyInvalidateOptions): Promise<void> {
      const split = splitInvalidateOptions(options);
      const queryKey = createGetMethodKey(
        route,
        keyPrefix,
        resolveCacheScope(inheritedCacheScope, split.cacheScope),
      );

      await queryClient.invalidateQueries(
        { ...split.filters, queryKey },
        split.invalidateOptions,
      );
    },
    getData(
      input?: TreatyQuerySemanticInput,
      options?: CacheUtilityScopeOptions,
    ): unknown {
      const queryKey = createGetKey(
        route,
        input,
        keyPrefix,
        resolveCacheScope(inheritedCacheScope, options?.cacheScope),
      );

      return queryClient.getQueryData(queryKey);
    },
    setData(...arguments_: readonly unknown[]): unknown {
      let input: TreatyQuerySemanticInput | undefined;
      let updater: unknown;
      let options: TreatySetDataOptions | undefined;

      if (arguments_.length === 1) {
        [updater] = arguments_;
      } else {
        [input, updater, options] = arguments_ as readonly [
          TreatyQuerySemanticInput | undefined,
          unknown,
          TreatySetDataOptions | undefined,
        ];
      }

      const queryKey = createGetKey(
        route,
        input,
        keyPrefix,
        resolveCacheScope(inheritedCacheScope, options?.cacheScope),
      );
      const setOptions = options?.updatedAt === undefined
        ? undefined
        : { updatedAt: options.updatedAt };

      return queryClient.setQueryData(
        queryKey,
        updater as Updater<unknown, unknown>,
        setOptions,
      );
    },
    async ensureData(
      input?: TreatyQuerySemanticInput,
      options?: TreatyEnsureDataOptions<unknown>,
    ): Promise<unknown> {
      const operation = createGetOperation(
        getMethod,
        route,
        keyPrefix,
        inheritedCacheScope,
        mapError,
      );

      return queryClient.ensureQueryData(
        operation.queryOptions(
          input as GetInput<unknown>,
          options as GetOperationOptions<unknown> | undefined,
        ),
      );
    },
  });
}

function createUtilityRouteProxy(
  client: unknown,
  queryClient: QueryClient,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  inheritedCacheScope: CacheScope | undefined,
  mapError: TreatyQueryErrorMapper | undefined,
): unknown {
  return new Proxy(function treatyQueryUtilityRoute(): void {}, {
    get(_target, property): unknown {
      if (property === routeSegment) {
        return (segment: string): unknown => {
          if (segment.length === 0) {
            throw new TypeError("An escaped Treaty route segment cannot be empty.");
          }

          return createUtilityRouteProxy(
            client,
            queryClient,
            appendEscapedRouteProperty(route, segment),
            keyPrefix,
            inheritedCacheScope,
            mapError,
          );
        };
      }

      if (property === "then" || property === "catch" || property === "finally") {
        return undefined;
      }
      if (typeof property !== "string") return undefined;

      if (property === "queryKey") {
        return (options?: CacheUtilityScopeOptions): TreatyQueryRouteKey =>
          createRouteKey(
            route,
            keyPrefix,
            resolveCacheScope(inheritedCacheScope, options?.cacheScope),
          );
      }

      if (property === "invalidate") {
        return async (options?: TreatyInvalidateOptions): Promise<void> => {
          const split = splitInvalidateOptions(options);
          const queryKey = createRouteKey(
            route,
            keyPrefix,
            resolveCacheScope(inheritedCacheScope, split.cacheScope),
          );

          await queryClient.invalidateQueries(
            { ...split.filters, queryKey },
            split.invalidateOptions,
          );
        };
      }

      if (property === "get") {
        return createGetUtilities(
          client,
          queryClient,
          route,
          keyPrefix,
          inheritedCacheScope,
          mapError,
        );
      }

      return createUtilityRouteProxy(
        client,
        queryClient,
        appendRouteProperty(route, property),
        keyPrefix,
        inheritedCacheScope,
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

      return createUtilityRouteProxy(
        client,
        queryClient,
        appendRouteParameters(route, parameters),
        keyPrefix,
        inheritedCacheScope,
        mapError,
      );
    },
  });
}

export function createTreatyQueryUtils<
  TClient,
  TMappedError extends Error | undefined = undefined,
>(
  client: TClient,
  queryClient: QueryClient,
  keyPrefix: readonly SerializableValue[] | undefined,
  inheritedCacheScope?: CacheScope,
  mapError?: TreatyQueryErrorMapper,
): TreatyQueryUtils<TClient, TMappedError> {
  const routes = createUtilityRouteProxy(
    client,
    queryClient,
    [],
    keyPrefix,
    inheritedCacheScope,
    mapError,
  );

  return new Proxy(routes as object, {
    get(target, property, receiver): unknown {
      if (property === "removeCacheScope") {
        return (scope: CacheScope): void => {
          removeCacheScopeQueries(
            queryClient,
            createKeyPrefix(keyPrefix),
            scope,
          );
        };
      }

      return Reflect.get(target, property, receiver);
    },
  }) as TreatyQueryUtils<TClient, TMappedError>;
}
