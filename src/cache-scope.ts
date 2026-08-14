import {
  hashKey,
  type QueryClient,
} from "@tanstack/react-query";

import type {
  CacheScope,
  SerializableValue,
  TreatyQueryPrefix,
  TreatyQueryScope,
} from "./types.js";

function cloneSerializable(
  value: unknown,
  ancestors: Set<object>,
): SerializableValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Cache scope numbers must be finite.");
    }

    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value !== "object") {
    throw new TypeError("Cache scopes must contain only serializable values.");
  }

  if (ancestors.has(value)) {
    throw new TypeError("Cache scopes cannot contain circular references.");
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Cache scopes cannot contain symbol keys.");
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError("Cache scopes cannot contain sparse arrays.");
        }
      }

      return Object.freeze(
        value.map((entry) => cloneSerializable(entry, ancestors)),
      );
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Cache scopes can contain only plain objects.");
    }

    const result: Record<string, SerializableValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = cloneSerializable(entry, ancestors);
    }

    return Object.freeze(result);
  } finally {
    ancestors.delete(value);
  }
}

export function normalizeCacheScope(value: CacheScope): CacheScope {
  if (typeof value === "string") return value;

  if (typeof value === "number") {
    return cloneSerializable(value, new Set()) as number;
  }

  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      "A tuple cache scope must contain at least one serializable value.",
    );
  }

  return cloneSerializable(value, new Set()) as CacheScope;
}

export function createCacheScopeMarker(value: CacheScope): TreatyQueryScope {
  return Object.freeze({
    kind: "treaty-query-scope" as const,
    value: normalizeCacheScope(value),
  });
}

export function resolveCacheScope(
  inheritedCacheScope: CacheScope | undefined,
  cacheScope: CacheScope | false | undefined,
): CacheScope | undefined {
  return cacheScope === false
    ? undefined
    : cacheScope ?? inheritedCacheScope;
}

function isPrefixMarker(
  value: unknown,
  expected: TreatyQueryPrefix,
): boolean {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === "treaty-query-prefix" &&
    hashKey([value]) === hashKey([expected]);
}

function isScopeMarker(value: unknown): value is TreatyQueryScope {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { readonly kind?: unknown }).kind === "treaty-query-scope";
}

function getScopeMarker(
  key: readonly unknown[],
  prefix: TreatyQueryPrefix | undefined,
): unknown {
  if (key[0] !== "treaty-query") return undefined;

  if (prefix === undefined) return key[1];
  if (!isPrefixMarker(key[1], prefix)) return undefined;
  return key[2];
}

export function removeCacheScopeQueries(
  queryClient: QueryClient,
  prefix: TreatyQueryPrefix | undefined,
  scope: CacheScope,
): void {
  const expectedHash = hashKey([createCacheScopeMarker(scope)]);

  queryClient.removeQueries({
    predicate(query): boolean {
      const marker = getScopeMarker(query.queryKey, prefix);

      return isScopeMarker(marker) &&
        hashKey([marker]) === expectedHash;
    },
  });
}
