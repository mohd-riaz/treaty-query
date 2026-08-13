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
import {
  appendRouteParameters,
  appendRouteProperty,
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

export type TreatyEnsureDataOptions<TMethod> = CacheUtilityScopeOptions &
  Omit<
    EnsureQueryDataOptions<
      GetData<TMethod>,
      GetError<TMethod>,
      GetData<TMethod>,
      TreatyQueryKey
    >,
    "queryFn" | "queryKey"
  > & {
    readonly request?: NonNullable<GetOperationOptions<TMethod>["request"]>;
  };

export type TreatySetDataOptions = CacheUtilityScopeOptions & SetDataOptions;

export interface TreatyRouteUtilities {
  queryKey(options?: CacheUtilityScopeOptions): TreatyQueryRouteKey;
  invalidate(options?: TreatyInvalidateOptions): Promise<void>;
}

export interface RequiredGetUtilities<TMethod> {
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
    options?: TreatyEnsureDataOptions<TMethod>,
  ): Promise<GetData<TMethod>>;
}

export interface OptionalGetUtilities<TMethod> {
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
    options?: TreatyEnsureDataOptions<TMethod>,
  ): Promise<GetData<TMethod>>;
}

export type GetUtilities<TMethod> = RequiresGetInput<TMethod> extends true
  ? RequiredGetUtilities<TMethod>
  : OptionalGetUtilities<TMethod>;

type UtilityRoutePropertyKey<TNode, TKey> = TKey extends string
  ? TKey extends "~path" | UnsupportedTerminalMethod
    ? never
    : TKey
  : never;

type UtilityRouteProperties<TNode> = {
  readonly [TKey in keyof TNode as UtilityRoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? GetUtilities<TNode[TKey]>
      : TreatyQueryRouteUtilitiesFor<TNode[TKey]>;
};

type DynamicUtilityRoute<TNode> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryRouteUtilitiesFor<TResult>
  : unknown;

export type TreatyQueryRouteUtilitiesFor<TNode> =
  & TreatyRouteUtilities
  & DynamicUtilityRoute<TNode>
  & UtilityRouteProperties<TNode>;

export type TreatyQueryUtils<TNode> = TreatyQueryRouteUtilitiesFor<TNode> & {
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
): unknown {
  return new Proxy(function treatyQueryUtilityRoute(): void {}, {
    get(_target, property): unknown {
      if (property === "then") return undefined;
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
        );
      }

      return createUtilityRouteProxy(
        client,
        queryClient,
        appendRouteProperty(route, property),
        keyPrefix,
        inheritedCacheScope,
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
      );
    },
  });
}

export function createTreatyQueryUtils<TClient>(
  client: TClient,
  queryClient: QueryClient,
  keyPrefix: readonly SerializableValue[] | undefined,
  inheritedCacheScope?: CacheScope,
): TreatyQueryUtils<TClient> {
  const routes = createUtilityRouteProxy(
    client,
    queryClient,
    [],
    keyPrefix,
    inheritedCacheScope,
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
  }) as TreatyQueryUtils<TClient>;
}
