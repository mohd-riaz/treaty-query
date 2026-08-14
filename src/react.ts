import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";
import {
  useQueryClient,
  useMutation,
  useQuery,
  type MutationKey,
  type QueryKey,
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

interface HookRouteParameterNamesSegment {
  readonly kind: "parameter-names";
  readonly value: readonly string[];
}

type HookRouteSegment = RouteSegment | HookRouteParameterNamesSegment;
type HookRouteParameterGroups = readonly RouteParameters[];

type AppendRouteParameterGroup<
  TGroups extends HookRouteParameterGroups,
  TParameters extends RouteParameters,
> = readonly [...TGroups, TParameters];

type UnionToIntersection<TValue> = (
  TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never;

type CombinedRouteParameters<TGroups extends HookRouteParameterGroups> =
  UnionToIntersection<TGroups[number]>;

type HookRouteParameterInput<TGroups extends HookRouteParameterGroups> =
  TGroups extends readonly []
    ? never
    : TGroups extends readonly [infer TOnly extends RouteParameters]
      ? TOnly
      : CombinedRouteParameters<TGroups> | TGroups;

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

type HookQueryInput<
  TMethod,
  TRouteParameters extends HookRouteParameterGroups,
> = TRouteParameters extends readonly []
  ? GetInput<TMethod>
  : GetInput<TMethod> extends undefined
    ? { readonly params: HookRouteParameterInput<TRouteParameters> }
    : GetInput<TMethod> & {
        readonly params: HookRouteParameterInput<TRouteParameters>;
      };

type HookMutationOptions<
  TMethod,
  TOnMutateResult,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
> = MutationOperationOptions<TMethod, TOnMutateResult, TMappedError> &
  { readonly mutationKey?: MutationKey } &
  (TRouteParameters extends readonly []
    ? unknown
    : { readonly params: HookRouteParameterInput<TRouteParameters> });

type HookQueryOptions<
  TMethod,
  TData,
  TMappedError extends Error | undefined,
> = GetOperationOptions<TMethod, TData, TMappedError> & {
  readonly queryKey?: QueryKey;
};

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
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> {
  useQuery<TData = GetData<TMethod>>(
    input: HookQueryInput<TMethod, TRouteParameters>,
    options?: HookQueryOptions<TMethod, TData, TMappedError>,
  ): UseQueryResult<TData, QueryError<TMethod, TMappedError>>;
}

export interface OptionalUseQueryOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> {
  useQuery<TData = GetData<TMethod>>(
    input?: HookQueryInput<TMethod, TRouteParameters>,
    options?: HookQueryOptions<TMethod, TData, TMappedError>,
  ): UseQueryResult<TData, QueryError<TMethod, TMappedError>>;
}

export type UseQueryOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> =
  TRouteParameters extends readonly []
    ? RequiresGetInput<TMethod> extends true
      ? RequiredUseQueryOperation<TMethod, TMappedError, TRouteParameters>
      : OptionalUseQueryOperation<TMethod, TMappedError, TRouteParameters>
    : RequiredUseQueryOperation<TMethod, TMappedError, TRouteParameters>;

export interface RequiredUseMutationOperation<
  TMethod,
  TMappedError extends Error | undefined = undefined,
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> {
  useMutation<TOnMutateResult = unknown>(
    options: HookMutationOptions<
      TMethod,
      TOnMutateResult,
      TMappedError,
      TRouteParameters
    >,
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
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> {
  useMutation<TOnMutateResult = unknown>(
    options?: HookMutationOptions<
      TMethod,
      TOnMutateResult,
      TMappedError,
      TRouteParameters
    >,
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
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> =
  TRouteParameters extends readonly []
    ? {} extends MutationRequest<TMethod>
      ? OptionalUseMutationOperation<TMethod, TMappedError, TRouteParameters>
      : RequiredUseMutationOperation<TMethod, TMappedError, TRouteParameters>
    : RequiredUseMutationOperation<TMethod, TMappedError, TRouteParameters>;

type HookRouteProperties<
  TNode,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
> = {
  readonly [TKey in keyof TNode as HookRoutePropertyKey<TNode, TKey>]:
    TKey extends "get"
      ? UseQueryOperation<TNode[TKey], TMappedError, TRouteParameters>
      : TKey extends "post" | "put" | "patch" | "delete"
        ? UseMutationOperation<TNode[TKey], TMappedError, TRouteParameters>
      : TreatyQueryHooks<TNode[TKey], TMappedError, TRouteParameters>;
};

type DynamicHookRoute<
  TNode,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
> = TNode extends (parameters: infer TParameters) => infer TResult
  ? (parameters: TParameters) => TreatyQueryHooks<
      TResult,
      TMappedError,
      TRouteParameters
    >
  : unknown;

type DynamicParameterMarkers<
  TResult,
  TParameters extends RouteParameters,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
  TRemaining extends keyof TParameters & string = keyof TParameters & string,
> = {
  readonly [TKey in TRemaining as `$${TKey}`]:
    Exclude<TRemaining, TKey> extends never
      ? TreatyQueryHooks<
          TResult,
          TMappedError,
          AppendRouteParameterGroup<TRouteParameters, TParameters>
        >
      : DynamicParameterMarkers<
          TResult,
          TParameters,
          TMappedError,
          TRouteParameters,
          Exclude<TRemaining, TKey>
        >;
};

type DynamicHookParameterProperties<
  TNode,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
> = TNode extends (parameters: infer TParameters) => infer TResult
  ? TParameters extends RouteParameters
    ? DynamicParameterMarkers<
        TResult,
        TParameters,
        TMappedError,
        TRouteParameters
      >
    : unknown
  : unknown;

type EscapedHookRoute<
  TNode,
  TMappedError extends Error | undefined,
  TRouteParameters extends HookRouteParameterGroups,
> = {
  readonly [routeSegment]: <TKey extends keyof TNode & string>(
    segment: TKey,
  ) => TreatyQueryHooks<TNode[TKey], TMappedError, TRouteParameters>;
};

export type TreatyQueryHooks<
  TNode,
  TMappedError extends Error | undefined = undefined,
  TRouteParameters extends HookRouteParameterGroups = readonly [],
> =
  & DynamicHookRoute<TNode, TMappedError, TRouteParameters>
  & DynamicHookParameterProperties<TNode, TMappedError, TRouteParameters>
  & EscapedHookRoute<TNode, TMappedError, TRouteParameters>
  & HookRouteProperties<TNode, TMappedError, TRouteParameters>;

function isRouteParameters(value: unknown): value is RouteParameters {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === "string" || typeof entry === "number",
  );
}

function appendHookRouteProperty(
  route: readonly HookRouteSegment[],
  property: string,
): readonly HookRouteSegment[] {
  return Object.freeze([...route, property]);
}

function appendEscapedHookRouteProperty(
  route: readonly HookRouteSegment[],
  property: string,
): readonly HookRouteSegment[] {
  return Object.freeze([
    ...route,
    Object.freeze({ kind: "escaped" as const, value: property }),
  ]);
}

function appendHookRouteParameters(
  route: readonly HookRouteSegment[],
  parameters: RouteParameters,
): readonly HookRouteSegment[] {
  return Object.freeze([
    ...route,
    Object.freeze({
      kind: "parameters" as const,
      value: Object.freeze({ ...parameters }),
    }),
  ]);
}

function appendHookParameterName(
  route: readonly HookRouteSegment[],
  name: string,
): readonly HookRouteSegment[] {
  const previous = route.at(-1);

  if (
    typeof previous !== "string" &&
    previous?.kind === "parameter-names"
  ) {
    return Object.freeze([
      ...route.slice(0, -1),
      Object.freeze({
        kind: "parameter-names" as const,
        value: Object.freeze([...previous.value, name]),
      }),
    ]);
  }

  return Object.freeze([
    ...route,
    Object.freeze({
      kind: "parameter-names" as const,
      value: Object.freeze([name]),
    }),
  ]);
}

function resolveHookRoute(
  route: readonly HookRouteSegment[],
  parameters: unknown,
): readonly RouteSegment[] {
  const resolved: RouteSegment[] = [];
  let parameterGroupIndex = 0;

  for (const segment of route) {
    if (
      typeof segment === "string" ||
      segment.kind !== "parameter-names"
    ) {
      resolved.push(segment);
      continue;
    }

    const parameterSource = Array.isArray(parameters)
      ? parameters[parameterGroupIndex]
      : parameters;

    if (!isRouteParameters(parameterSource)) {
      throw new TypeError(
        "Compiler-safe dynamic routes require their inferred params object.",
      );
    }

    const selectedParameters: Record<string, string | number> = {};
    for (const name of segment.value) {
      const value = parameterSource[name];
      if (typeof value !== "string" && typeof value !== "number") {
        throw new TypeError(`Missing Treaty route parameter: ${name}.`);
      }
      selectedParameters[name] = value;
    }

    resolved.push(Object.freeze({
      kind: "parameters" as const,
      value: Object.freeze(selectedParameters),
    }));
    parameterGroupIndex += 1;
  }

  if (parameterGroupIndex === 0 && parameters !== undefined) {
    throw new TypeError(
      "This Treaty Query route does not declare compiler-safe parameters.",
    );
  }

  return Object.freeze(resolved);
}

function splitHookQueryInput(
  input: unknown,
): {
  readonly input: GetInput<unknown> | undefined;
  readonly parameters: unknown;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("params" in input)
  ) {
    return {
      input: input as GetInput<unknown>,
      parameters: undefined,
    };
  }

  const { params, ...semanticInput } = input as Readonly<
    Record<string, unknown>
  >;

  return {
    input: Object.keys(semanticInput).length === 0
      ? undefined
      : semanticInput as GetInput<unknown>,
    parameters: params,
  };
}

function splitHookMutationOptions(
  options: unknown,
): {
  readonly options:
    | MutationOperationOptions<unknown, unknown>
    | undefined;
  readonly mutationKey: MutationKey | undefined;
  readonly parameters: unknown;
} {
  if (
    typeof options !== "object" ||
    options === null ||
    !("params" in options)
  ) {
    return {
      options: options as MutationOperationOptions<unknown, unknown> | undefined,
      mutationKey: undefined,
      parameters: undefined,
    };
  }

  const { params, mutationKey, ...operationOptions } = options as Readonly<
    Record<string, unknown>
  >;

  return {
    options: operationOptions as MutationOperationOptions<unknown, unknown>,
    mutationKey: mutationKey as MutationKey | undefined,
    parameters: params,
  };
}

function createHookRouteProxy(
  clientContext: Context<unknown>,
  cacheScopeContext: Context<CacheScope | undefined>,
  route: readonly HookRouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  mapError: TreatyQueryErrorMapper | undefined,
): unknown {
  const propertyCache = new Map<PropertyKey, unknown>();

  return new Proxy(function treatyQueryHookRoute(): void {}, {
    get(_target, property): unknown {
      if (property === "then" || property === "catch" || property === "finally") {
        return undefined;
      }

      if (propertyCache.has(property)) {
        return propertyCache.get(property);
      }

      let value: unknown;

      if (property === routeSegment) {
        value = (segment: string): unknown => {
          if (segment.length === 0) {
            throw new TypeError("An escaped Treaty route segment cannot be empty.");
          }

          return createHookRouteProxy(
            clientContext,
            cacheScopeContext,
            appendEscapedHookRouteProperty(route, segment),
            keyPrefix,
            mapError,
          );
        };
      } else if (typeof property !== "string") {
        value = undefined;
      } else if (property.startsWith("$") && property.length > 1) {
        value = createHookRouteProxy(
          clientContext,
          cacheScopeContext,
          appendHookParameterName(route, property.slice(1)),
          keyPrefix,
          mapError,
        );
      } else if (property === "get") {
        value = Object.freeze({
          useQuery<TData>(
            input?: unknown,
            options?: HookQueryOptions<unknown, TData, undefined>,
          ): UseQueryResult<TData, Error> {
            const client = useContext(clientContext);
            const inheritedCacheScope = useContext(cacheScopeContext);

            if (client === missingClient) {
              throw new Error(
                "Treaty Query hooks must be rendered inside this tq.Provider.",
              );
            }

            const splitInput = splitHookQueryInput(input);
            const resolvedRoute = resolveHookRoute(
              route,
              splitInput.parameters,
            );
            const method = resolveRouteMethod(client, resolvedRoute, "get");
            const operation = createGetOperation(
              method,
              resolvedRoute,
              keyPrefix,
              inheritedCacheScope,
              mapError,
            );
            const { queryKey, ...operationOptions } = options ?? {};
            const generatedOptions = operation.queryOptions(
              splitInput.input as GetInput<unknown>,
              operationOptions,
            );
            const hookOptions = queryKey === undefined
              ? generatedOptions
              : { ...generatedOptions, queryKey };

            return useQuery(
              hookOptions as unknown as Parameters<typeof useQuery>[0],
            ) as UseQueryResult<TData, Error>;
          },
        });
      } else if (isMutationMethodName(property)) {
        value = Object.freeze({
          useMutation<TOnMutateResult = unknown>(
            options?: unknown,
          ): UseMutationResult<unknown, Error, unknown, TOnMutateResult> {
            const client = useContext(clientContext);

            if (client === missingClient) {
              throw new Error(
                "Treaty Query hooks must be rendered inside this tq.Provider.",
              );
            }

            const splitOptions = splitHookMutationOptions(options);
            const resolvedRoute = resolveHookRoute(
              route,
              splitOptions.parameters,
            );
            const treatyMethod = resolveRouteMethod(
              client,
              resolvedRoute,
              property,
            );
            const operation = createMutationOperation(
              treatyMethod,
              property,
              resolvedRoute,
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

            const generatedOptions = operation.mutationOptions(
              splitOptions.options as MutationOperationOptions<
                unknown,
                TOnMutateResult
              >,
            );
            const hookOptions = splitOptions.mutationKey === undefined
              ? generatedOptions
              : {
                  ...generatedOptions,
                  mutationKey: splitOptions.mutationKey,
                };

            return useMutation(
              hookOptions as Parameters<typeof useMutation>[0],
            ) as unknown as UseMutationResult<
              unknown,
              Error,
              unknown,
              TOnMutateResult
            >;
          },
        });
      } else {
        value = createHookRouteProxy(
          clientContext,
          cacheScopeContext,
          appendHookRouteProperty(route, property),
          keyPrefix,
          mapError,
        );
      }

      propertyCache.set(property, value);
      return value;
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
        appendHookRouteParameters(route, parameters),
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
