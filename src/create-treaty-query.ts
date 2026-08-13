import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

import {
  createStaticHelpers,
  type StaticTreatyQueryHelpers,
} from "./static-helpers.js";
import {
  createReactTreatyQueryRuntime,
  type StaticTreatyQueryHooks,
  type TreatyQueryProvider,
} from "./react.js";
import type { SerializableValue } from "./types.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;

export interface CreateTreatyQueryOptions {
  readonly keyPrefix?: readonly SerializableValue[];
}

export interface CreateHelpersOptions<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
}

export interface TreatyQueryRoot<TApp extends AnyElysia> {
  readonly Provider: TreatyQueryProvider<TApp>;
  createHelpers(
    options: CreateHelpersOptions<TApp>,
  ): StaticTreatyQueryHelpers<Treaty.Create<TApp>>;
}

export type TreatyQueryClient<TApp extends AnyElysia> =
  & TreatyQueryRoot<TApp>
  & StaticTreatyQueryHooks<Treaty.Create<TApp>>;

export function createTreatyQuery<TApp extends AnyElysia>(
  options: CreateTreatyQueryOptions = {},
): TreatyQueryClient<TApp> {
  const reactRuntime = createReactTreatyQueryRuntime<TApp>(options.keyPrefix);
  const root: TreatyQueryRoot<TApp> = Object.freeze({
    Provider: reactRuntime.Provider,
    createHelpers(
      helperOptions: CreateHelpersOptions<TApp>,
    ): StaticTreatyQueryHelpers<Treaty.Create<TApp>> {
      return createStaticHelpers(helperOptions.client, options.keyPrefix);
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
