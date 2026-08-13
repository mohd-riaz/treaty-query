import type { Treaty } from "@elysiajs/eden";
import type { Elysia } from "elysia";

import {
  createStaticHelpers,
  type StaticTreatyQueryHelpers,
} from "./static-helpers.js";
import type { SerializableValue } from "./types.js";

type AnyElysia = Elysia<any, any, any, any, any, any, any>;

export interface CreateTreatyQueryOptions {
  readonly keyPrefix?: readonly SerializableValue[];
}

export interface CreateHelpersOptions<TApp extends AnyElysia> {
  readonly client: Treaty.Create<TApp>;
}

export interface TreatyQueryRoot<TApp extends AnyElysia> {
  createHelpers(
    options: CreateHelpersOptions<TApp>,
  ): StaticTreatyQueryHelpers<Treaty.Create<TApp>>;
}

export function createTreatyQuery<TApp extends AnyElysia>(
  options: CreateTreatyQueryOptions = {},
): TreatyQueryRoot<TApp> {
  return Object.freeze({
    createHelpers(
      helperOptions: CreateHelpersOptions<TApp>,
    ): StaticTreatyQueryHelpers<Treaty.Create<TApp>> {
      return createStaticHelpers(helperOptions.client, options.keyPrefix);
    },
  });
}
