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
  type QueryError,
} from "./static-helpers.js";
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
  SerializableValue,
} from "./types.js";
import type { TreatyQueryErrorMapper } from "./error.js";

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

export interface RequiredUseQueryOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  useQuery<TData = GetData<TMethod>>(
    input: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData, TMappedError>,
  ): UseQueryResult<TData, QueryError<TMethod, TMappedError>>;
}

export interface OptionalUseQueryOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  useQuery<TData = GetData<TMethod>>(
    input?: GetInput<TMethod>,
    options?: GetOperationOptions<TMethod, TData, TMappedError>,
  ): UseQueryResult<TData, QueryError<TMethod, TMappedError>>;
}

export type UseQueryOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> =
  RequiresGetInput<TMethod> extends true
    ? RequiredUseQueryOperation<TMethod, TMappedError>
    : OptionalUseQueryOperation<TMethod, TMappedError>;

export interface RequiredUseMutationOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  useMutation<TOnMutateResult = unknown>(
    options: MutationOperationOptions<TMethod, TOnMutateResult, TMappedError>,
  ): UseMutationResult<
    MutationData<TMethod>,
    MutationError<TMethod, TMappedError>,
    MutationBody<TMethod>,
    TOnMutateResult
  >;
}

export interface OptionalUseMutationOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> {
  useMutation<TOnMutateResult = unknown>(
    options?: MutationOperationOptions<TMethod, TOnMutateResult, TMappedError>,
  ): UseMutationResult<
    MutationData<TMethod>,
    MutationError<TMethod, TMappedError>,
    MutationBody<TMethod>,
    TOnMutateResult
  >;
}

export type UseMutationOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
> =
  {} extends MutationRequest<TMethod>
    ? OptionalUseMutationOperation<TMethod, TMappedError>
    : RequiredUseMutationOperation<TMethod, TMappedError>;

type HookRouteProperties<TNode, TMappedError extends Error | undefined> = {
  readonly [TKey in keyof TNode as HookRoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? UseQueryOperation<TNode[TKey], TMappedError>
      : TKey extends "post" | "put" | "patch" | "delete"
        ? UseMutationOperation<TNode[TKey], TMappedError>
      : TreatyQueryHooks<TNode[TKey], TMappedError>;
};

type DynamicHookRoute<TNode, TMappedError extends Error | undefined> = TNode extends (
  parameters: infer TParameters,
) => infer TResult
  ? (parameters: TParameters) => TreatyQueryHooks<TResult, TMappedError>
  : unknown;

type EscapedHookRoute<TNode, TMappedError extends Error | undefined> = {
  readonly [routeSegment]: <TKey extends keyof TNode & string>(
    segment: TKey,
  ) => TreatyQueryHooks<TNode[TKey], TMappedError>;
};

export type TreatyQueryHooks<
  TNode,
  TMappedError extends Error | undefined = undefined,
> =
  & DynamicHookRoute<TNode, TMappedError>
  & EscapedHookRoute<TNode, TMappedError>
  & HookRouteProperties<TNode, TMappedError>;

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
  mapError: TreatyQueryErrorMapper | undefined,
): unknown {
  return new Proxy(function treatyQueryHookRoute(): void {}, {
    get(_target, property): unknown {
      if (property === routeSegment) {
        return (segment: string): unknown => {
          if (segment.length === 0) {
            throw new TypeError("An escaped Treaty route segment cannot be empty.");
          }

          return createHookRouteProxy(
            clientContext,
            cacheScopeContext,
            appendEscapedRouteProperty(route, segment),
            keyPrefix,
            mapError,
          );
        };
      }

      if (property === "then" || property === "catch" || property === "finally") {
        return undefined;
      }
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
              mapError,
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
              mapError,
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

      return createHookRouteProxy(
        clientContext,
        cacheScopeContext,
        appendRouteParameters(route, parameters),
        keyPrefix,
        mapError,
      );
    },
  });
}

export interface ReactTreatyQueryRuntime<
  TApp extends AnyElysia,
  TMappedError extends Error | undefined = undefined,
> {
  readonly Provider: TreatyQueryProvider<TApp>;
  readonly CacheScope: CacheScopeProvider;
  readonly useUtils: () => TreatyQueryUtils<Treaty.Create<TApp>, TMappedError>;
  readonly routes: TreatyQueryHooks<Treaty.Create<TApp>, TMappedError>;
}

export function createReactTreatyQueryRuntime<
  TApp extends AnyElysia,
  TMappedError extends Error | undefined = undefined,
>(
  keyPrefix: readonly SerializableValue[] | undefined,
  mapError?: TreatyQueryErrorMapper,
): ReactTreatyQueryRuntime<TApp, TMappedError> {
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

  function useUtils(): TreatyQueryUtils<Treaty.Create<TApp>, TMappedError> {
    const client = useContext(clientContext);
    const inheritedCacheScope = useContext(cacheScopeContext);
    const queryClient = useQueryClient();

    if (client === missingClient) {
      throw new Error(
        "Treaty Query utilities must be used inside this tq.Provider.",
      );
    }

    return createTreatyQueryUtils<
      Treaty.Create<TApp>,
      TMappedError
    >(
      client as Treaty.Create<TApp>,
      queryClient,
      keyPrefix,
      inheritedCacheScope,
      mapError,
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
      mapError,
    ) as TreatyQueryHooks<Treaty.Create<TApp>, TMappedError>,
  };
}

/** @deprecated Use `UseQueryOperation`. */
export type StaticUseQueryOperation<TMethod> = UseQueryOperation<TMethod>;
/** @deprecated Use `TreatyQueryHooks`. */
export type StaticTreatyQueryHooks<TNode> = TreatyQueryHooks<TNode>;
