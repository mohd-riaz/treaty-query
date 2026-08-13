import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";
import {
  useQueryClient,
  useMutation,
  useQuery,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import {
  createContext,
  createElement,
  useContext,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";

import {
  normalizeCacheScope,
} from "./cache-scope.js";
import {
  createTreatyQueryUtils,
  type TreatyQueryUtils,
} from "./utils.js";

import {
  createMutationOperation,
  isMutationMethodName,
  type MutationBody,
  type MutationData,
  type MutationError,
  type MutationFactoryResult,
  type MutationOperationOptions,
  type MutationRequest,
} from "./mutation.js";

import {
  createGetOperation,
  type GetData,
  type GetError,
  type GetInput,
  type GetOperationOptions,
} from "./static-helpers.js";
import {
  appendRouteParameters,
  appendRouteProperty,
  resolveRouteMethod,
  type RouteParameters,
  type RouteSegment,
} from "./route.js";
import type {
  CacheScope,
  SerializableValue,
} from "./types.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;
type Callable = (...arguments_: never[]) => unknown;
type UnsupportedTerminalMethod =
  | "options"
  | "head"
  | "connect"
  | "subscribe";

const missingClient = Symbol("treaty-query-missing-client");

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

type HookRoutePropertyKey<TNode, TKey> = TKey extends string
  ? TKey extends "~path"
    ? never
    : TKey extends "get"
      ? TKey
      : TKey extends "post" | "put" | "patch" | "delete"
        ? TKey
      : TKey extends UnsupportedTerminalMethod
        ? never
        : TKey
  : never;

export interface TreatyQueryProviderProps<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
  readonly children?: ReactNode;
}

export type TreatyQueryProvider<TApp extends AnyElysia> = (
  props: TreatyQueryProviderProps<TApp>,
) => ReactElement;

export interface CacheScopeProviderProps {
  readonly value: CacheScope;
  readonly children?: ReactNode;
}

export type CacheScopeProvider = (
  props: CacheScopeProviderProps,
) => ReactElement;

export interface RequiredUseQueryOperation<TMethod> {
  useQuery<TData = GetData<TMethod>>(
    input: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData>,
  ): UseQueryResult<TData, GetError<TMethod>>;
}

export interface OptionalUseQueryOperation<TMethod> {
  useQuery<TData = GetData<TMethod>>(
    input?: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData>,
  ): UseQueryResult<TData, GetError<TMethod>>;
}

export type UseQueryOperation<TMethod> =
  RequiresGetInput<TMethod> extends true
    ? RequiredUseQueryOperation<TMethod>
    : OptionalUseQueryOperation<TMethod>;

export interface RequiredUseMutationOperation<TMethod> {
  useMutation<TOnMutateResult = unknown>(
    options: MutationOperationOptions<TMethod, TOnMutateResult>,
  ): UseMutationResult<
    MutationData<TMethod>,
    MutationError<TMethod>,
    MutationBody<TMethod>,
    TOnMutateResult
  >;
}

export interface OptionalUseMutationOperation<TMethod> {
  useMutation<TOnMutateResult = unknown>(
    options?: MutationOperationOptions<TMethod, TOnMutateResult>,
  ): UseMutationResult<
    MutationData<TMethod>,
    MutationError<TMethod>,
    MutationBody<TMethod>,
    TOnMutateResult
  >;
}

export type UseMutationOperation<TMethod> =
  {} extends MutationRequest<TMethod>
    ? OptionalUseMutationOperation<TMethod>
    : RequiredUseMutationOperation<TMethod>;

type HookRouteProperties<TNode> = {
  readonly [TKey in keyof TNode as HookRoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? UseQueryOperation<TNode[TKey]>
      : TKey extends "post" | "put" | "patch" | "delete"
        ? UseMutationOperation<TNode[TKey]>
      : TreatyQueryHooks<TNode[TKey]>;
};

type DynamicHookRoute<TNode> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryHooks<TResult>
  : unknown;

export type TreatyQueryHooks<TNode> =
  & DynamicHookRoute<TNode>
  & HookRouteProperties<TNode>;

function isRouteParameters(value: unknown): value is RouteParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "string" || typeof entry === "number",
  );
}

function createHookRouteProxy(
  clientContext: Context<unknown>,
  cacheScopeContext: Context<CacheScope | undefined>,
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
): unknown {
  return new Proxy(function treatyQueryHookRoute(): void {}, {
    get(_target, property): unknown {
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;

      if (property === "get") {
        return Object.freeze({
          useQuery<TData>(
            input?: GetInput<unknown>,
            options?: GetOperationOptions<unknown, TData>,
          ): UseQueryResult<TData, Error> {
            const client = useContext(clientContext);
            const inheritedCacheScope = useContext(cacheScopeContext);

            if (client === missingClient) {
              throw new Error(
                "Treaty Query hooks must be rendered inside this tq.Provider.",
              );
            }

            const method = resolveRouteMethod(client, route, "get");
            const operation = createGetOperation(
              method,
              route,
              keyPrefix,
              inheritedCacheScope,
            );
            const runtimeInput = input as unknown as GetInput<unknown>;
            const runtimeOptions = options as unknown as
              | GetOperationOptions<unknown, TData>
              | undefined;

            return useQuery(
              operation.queryOptions(runtimeInput, runtimeOptions),
            ) as UseQueryResult<TData, Error>;
          },
        });
      }

      if (isMutationMethodName(property)) {
        return Object.freeze({
          useMutation<TOnMutateResult = unknown>(
            options?: MutationOperationOptions<unknown, TOnMutateResult>,
          ): UseMutationResult<unknown, Error, unknown, TOnMutateResult> {
            const client = useContext(clientContext);

            if (client === missingClient) {
              throw new Error(
                "Treaty Query hooks must be rendered inside this tq.Provider.",
              );
            }

            const treatyMethod = resolveRouteMethod(client, route, property);
            const operation = createMutationOperation(
              treatyMethod,
              property,
              route,
              keyPrefix,
            ) as {
              mutationOptions(
                runtimeOptions?: MutationOperationOptions<
                  unknown,
                  TOnMutateResult
                >,
              ): MutationFactoryResult<unknown, TOnMutateResult>;
            };

            return useMutation(
              operation.mutationOptions(options),
            ) as unknown as UseMutationResult<
              unknown,
              Error,
              unknown,
              TOnMutateResult
            >;
          },
        });
      }

      return createHookRouteProxy(
        clientContext,
        cacheScopeContext,
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

      return createHookRouteProxy(
        clientContext,
        cacheScopeContext,
        appendRouteParameters(route, parameters),
        keyPrefix,
      );
    },
  });
}

export interface ReactTreatyQueryRuntime<TApp extends AnyElysia> {
  readonly Provider: TreatyQueryProvider<TApp>;
  readonly CacheScope: CacheScopeProvider;
  readonly useUtils: () => TreatyQueryUtils<Treaty.Create<TApp>>;
  readonly routes: TreatyQueryHooks<Treaty.Create<TApp>>;
}

export function createReactTreatyQueryRuntime<TApp extends AnyElysia>(
  keyPrefix: readonly SerializableValue[] | undefined,
): ReactTreatyQueryRuntime<TApp> {
  const clientContext = createContext<unknown>(missingClient);
  const cacheScopeContext = createContext<CacheScope | undefined>(undefined);

  function Provider(
    props: TreatyQueryProviderProps<TApp>,
  ): ReactElement {
    return createElement(
      clientContext.Provider,
      { value: props.client },
      props.children,
    );
  }

  function CacheScopeComponent(
    props: CacheScopeProviderProps,
  ): ReactElement {
    return createElement(
      cacheScopeContext.Provider,
      { value: normalizeCacheScope(props.value) },
      props.children,
    );
  }

  function useUtils(): TreatyQueryUtils<Treaty.Create<TApp>> {
    const client = useContext(clientContext);
    const inheritedCacheScope = useContext(cacheScopeContext);
    const queryClient = useQueryClient();

    if (client === missingClient) {
      throw new Error(
        "Treaty Query utilities must be used inside this tq.Provider.",
      );
    }

    return createTreatyQueryUtils(
      client as Treaty.Create<TApp>,
      queryClient,
      keyPrefix,
      inheritedCacheScope,
    );
  }

  return {
    Provider,
    CacheScope: CacheScopeComponent,
    useUtils,
    routes: createHookRouteProxy(
      clientContext,
      cacheScopeContext,
      [],
      keyPrefix,
    ) as TreatyQueryHooks<Treaty.Create<TApp>>,
  };
}

/** @deprecated Use `UseQueryOperation`. */
export type StaticUseQueryOperation<TMethod> = UseQueryOperation<TMethod>;
/** @deprecated Use `TreatyQueryHooks`. */
export type StaticTreatyQueryHooks<TNode> = TreatyQueryHooks<TNode>;
