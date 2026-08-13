import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";
import {
  createContext,
  createElement,
  useContext,
  type Context,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import {
  createStaticGetOperation,
  type StaticGetData,
  type StaticGetError,
} from "./static-helpers.js";
import type {
  SerializableValue,
  StaticGetQueryOptionsInput,
} from "./types.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;
type Callable = (...arguments_: never[]) => unknown;

const missingClient = Symbol("treaty-query-missing-client");

type AcceptsNoArguments<TMethod> = TMethod extends Callable
  ? [] extends Parameters<TMethod>
    ? true
    : false
  : false;

type StaticHookKey<TNode, TKey> = TKey extends string
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

export interface TreatyQueryProviderProps<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
  readonly children?: ReactNode;
}

export type TreatyQueryProvider<TApp extends AnyElysia> = (
  props: TreatyQueryProviderProps<TApp>,
) => ReactElement;

export interface StaticUseQueryOperation<TMethod> {
  useQuery<TData = StaticGetData<TMethod>>(
    input?: undefined,
    options?: StaticGetQueryOptionsInput<
      StaticGetData<TMethod>,
      StaticGetError<TMethod>,
      TData
    >,
  ): UseQueryResult<TData, StaticGetError<TMethod>>;
}

export type StaticTreatyQueryHooks<TNode> = {
  readonly [TKey in keyof TNode as StaticHookKey<TNode, TKey>]:
    TKey extends "get"
      ? StaticUseQueryOperation<TNode[TKey]>
      : StaticTreatyQueryHooks<TNode[TKey]>;
};

function getClientMethod(
  client: unknown,
  path: readonly string[],
  method: "get",
): unknown {
  let node = client;

  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment];
  }

  return (node as Record<string, unknown>)[method];
}

function createHookRouteProxy(
  clientContext: Context<unknown>,
  path: readonly string[],
  keyPrefix: readonly SerializableValue[] | undefined,
): unknown {
  return new Proxy(Object.create(null) as object, {
    get(_target, property): unknown {
      if (property === "then") return undefined;
      if (typeof property !== "string") return undefined;

      if (property === "get") {
        return Object.freeze({
          useQuery<TData>(
            _input?: undefined,
            options?: StaticGetQueryOptionsInput<unknown, Error, TData>,
          ): UseQueryResult<TData, Error> {
            const client = useContext(clientContext);

            if (client === missingClient) {
              throw new Error(
                "Treaty Query hooks must be rendered inside this tq.Provider.",
              );
            }

            const method = getClientMethod(client, path, "get");
            const operation = createStaticGetOperation(
              method,
              path,
              keyPrefix,
            );
            const runtimeOptions = options as unknown as
              | StaticGetQueryOptionsInput<
                  unknown,
                  StaticGetError<unknown>,
                  TData
                >
              | undefined;

            return useQuery(
              operation.queryOptions(runtimeOptions),
            ) as UseQueryResult<TData, Error>;
          },
        });
      }

      return createHookRouteProxy(
        clientContext,
        [...path, property],
        keyPrefix,
      );
    },
  });
}

export interface ReactTreatyQueryRuntime<TApp extends AnyElysia> {
  readonly Provider: TreatyQueryProvider<TApp>;
  readonly routes: StaticTreatyQueryHooks<Treaty.Create<TApp>>;
}

export function createReactTreatyQueryRuntime<TApp extends AnyElysia>(
  keyPrefix: readonly SerializableValue[] | undefined,
): ReactTreatyQueryRuntime<TApp> {
  const clientContext = createContext<unknown>(missingClient);

  function Provider(
    props: TreatyQueryProviderProps<TApp>,
  ): ReactElement {
    return createElement(
      clientContext.Provider,
      { value: props.client },
      props.children,
    );
  }

  return {
    Provider,
    routes: createHookRouteProxy(
      clientContext,
      [],
      keyPrefix,
    ) as StaticTreatyQueryHooks<Treaty.Create<TApp>>,
  };
}
