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
import type {
  TreatyQueryError,
} from "./error.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;

export interface CreateTreatyQueryOptions<TMappedError extends Error = Error> {
  readonly keyPrefix?: readonly SerializableValue[];
  readonly mapError?: (error: TreatyQueryError) => TMappedError;
}

export interface CreateHelpersOptions<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
  readonly cacheScope?: CacheScope;
}

export interface TreatyQueryRoot<
  TApp extends AnyElysia,
  TMappedError extends Error | undefined = undefined,
> {
  readonly Provider: TreatyQueryProvider<TApp>;
  readonly CacheScope: CacheScopeProvider;
  useUtils(): TreatyQueryUtils<Treaty.Create<TApp>, TMappedError>;
  createHelpers(
    options: CreateHelpersOptions<TApp>,
  ): TreatyQueryHelpers<Treaty.Create<TApp>, TMappedError>;
}

export type TreatyQueryClient<
  TApp extends AnyElysia,
  TMappedError extends Error | undefined = undefined,
> =
  & TreatyQueryRoot<TApp, TMappedError>
  & TreatyQueryHooks<Treaty.Create<TApp>, TMappedError>;

type CreateTreatyQueryOptionsWithoutMapper = Omit<
  CreateTreatyQueryOptions,
  "mapError"
> & { readonly mapError?: undefined };

export interface CreateTreatyQueryFactory {
  <TApp extends AnyElysia>(
    options?: CreateTreatyQueryOptionsWithoutMapper,
  ): TreatyQueryClient<TApp>;
  <TApp extends AnyElysia>(
    options: CreateTreatyQueryOptions,
  ): TreatyQueryClient<TApp, Error>;
  <TApp extends AnyElysia, TMappedError extends Error>(
    options: CreateTreatyQueryOptions<TMappedError>,
  ): TreatyQueryClient<TApp, TMappedError>;
}

function createTreatyQueryImplementation(
  options: CreateTreatyQueryOptions = {},
): TreatyQueryClient<AnyElysia, Error | undefined> {
  const reactRuntime = createReactTreatyQueryRuntime<
    AnyElysia,
    Error | undefined
  >(
    options.keyPrefix,
    options.mapError,
  );
  const root: TreatyQueryRoot<AnyElysia, Error | undefined> = Object.freeze({
    Provider: reactRuntime.Provider,
    CacheScope: reactRuntime.CacheScope,
    useUtils: reactRuntime.useUtils,
    createHelpers(
      helperOptions: CreateHelpersOptions<AnyElysia>,
    ): TreatyQueryHelpers<Treaty.Create<AnyElysia>, Error | undefined> {
      return createTreatyQueryHelpers<
        Treaty.Create<AnyElysia>,
        Error | undefined
      >(
        helperOptions.client,
        options.keyPrefix,
        helperOptions.cacheScope === undefined
          ? undefined
          : normalizeCacheScope(helperOptions.cacheScope),
        options.mapError,
      );
    },
  });

  return new Proxy(root, {
    get(target, property, receiver): unknown {
      if (property === "then" || property === "catch" || property === "finally") {
        return undefined;
      }
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return Reflect.get(reactRuntime.routes, property);
    },
  }) as TreatyQueryClient<AnyElysia, Error | undefined>;
}

export const createTreatyQuery = createTreatyQueryImplementation as
  CreateTreatyQueryFactory;
