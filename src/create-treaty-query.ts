import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

import {
  createTreatyQueryHelpers,
  type TreatyQueryHelpers,
} from "./static-helpers.js";
import { normalizeCacheScope } from "./cache-scope.js";
import {
  createReactTreatyQueryRuntime,
  type CacheScopeProvider,
  type TreatyQueryHooks,
  type TreatyQueryProvider,
} from "./react.js";
import type { TreatyQueryUtils } from "./utils.js";
import type { CacheScope, SerializableValue } from "./types.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;

export interface CreateTreatyQueryOptions {
  readonly keyPrefix?: readonly SerializableValue[];
}

export interface CreateHelpersOptions<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
  readonly cacheScope?: CacheScope;
}

export interface TreatyQueryRoot<TApp extends AnyElysia> {
  readonly Provider: TreatyQueryProvider<TApp>;
  readonly CacheScope: CacheScopeProvider;
  useUtils(): TreatyQueryUtils<Treaty.Create<TApp>>;
  createHelpers(
    options: CreateHelpersOptions<TApp>,
  ): TreatyQueryHelpers<Treaty.Create<TApp>>;
}

export type TreatyQueryClient<TApp extends AnyElysia> =
  & TreatyQueryRoot<TApp>
  & TreatyQueryHooks<Treaty.Create<TApp>>;

export function createTreatyQuery<TApp extends AnyElysia>(
  options: CreateTreatyQueryOptions = {},
): TreatyQueryClient<TApp> {
  const reactRuntime = createReactTreatyQueryRuntime<TApp>(options.keyPrefix);
  const root: TreatyQueryRoot<TApp> = Object.freeze({
    Provider: reactRuntime.Provider,
    CacheScope: reactRuntime.CacheScope,
    useUtils: reactRuntime.useUtils,
    createHelpers(
      helperOptions: CreateHelpersOptions<TApp>,
    ): TreatyQueryHelpers<Treaty.Create<TApp>> {
      return createTreatyQueryHelpers(
        helperOptions.client,
        options.keyPrefix,
        helperOptions.cacheScope === undefined
          ? undefined
          : normalizeCacheScope(helperOptions.cacheScope),
      );
    },
  });

  return new Proxy(root, {
    get(target, property, receiver): unknown {
      if (property === "then") return undefined;
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return Reflect.get(reactRuntime.routes, property);
    },
  }) as TreatyQueryClient<TApp>;
}
