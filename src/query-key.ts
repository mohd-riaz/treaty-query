import type { RouteSegment } from "./route.js";
import { createCacheScopeMarker } from "./cache-scope.js";
import type {
  CacheScope,
  SerializableValue,
  TreatyQueryKey,
  TreatyMutationKey,
  TreatyMutationMethod,
  TreatyMutationOperation,
  TreatyQueryOperation,
  TreatyQueryParameterEntry,
  TreatyQueryParameterSegment,
  TreatyQueryPathSegment,
  TreatyQueryPrefix,
  TreatyQueryRouteKey,
  TreatyQuerySemanticInput,
} from "./types.js";

const namespace = "treaty-query" as const;

export function createKeyPrefix(
  keyPrefix: readonly SerializableValue[] | undefined,
): TreatyQueryPrefix | undefined {
  return keyPrefix === undefined
    ? undefined
    : Object.freeze({
        kind: "treaty-query-prefix" as const,
        value: Object.freeze([...keyPrefix]),
      });
}

function createParameterKey(
  parameters: Readonly<Record<string, string | number>>,
): TreatyQueryParameterSegment {
  const entries: TreatyQueryParameterEntry[] = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => Object.freeze([name, String(value)]));

  return Object.freeze(["$params", Object.freeze(entries)]);
}

function createPathKey(
  route: readonly RouteSegment[],
): readonly TreatyQueryPathSegment[] {
  return Object.freeze(
    route.map((segment) =>
      typeof segment === "string"
        ? segment
        : segment.kind === "escaped"
          ? segment.value
          : createParameterKey(segment.value),
    ),
  );
}

export function createRouteKey(
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  cacheScope: CacheScope | undefined,
): TreatyQueryRouteKey {
  const path = createPathKey(route);
  const prefix = createKeyPrefix(keyPrefix);
  const scope = cacheScope === undefined
    ? undefined
    : createCacheScopeMarker(cacheScope);

  if (prefix === undefined) {
    return scope === undefined
      ? Object.freeze([namespace, path])
      : Object.freeze([namespace, scope, path]);
  }

  return scope === undefined
    ? Object.freeze([namespace, prefix, path])
    : Object.freeze([namespace, prefix, scope, path]);
}

export function createGetMethodKey(
  route: readonly RouteSegment[],
  keyPrefix: readonly SerializableValue[] | undefined,
  cacheScope: CacheScope | undefined,
): TreatyQueryKey {
  return createGetKey(route, undefined, keyPrefix, cacheScope);
}

function createOperation(
  input: TreatyQuerySemanticInput | undefined,
): TreatyQueryOperation {
  if (input === undefined || input.query === undefined) {
    return Object.freeze({
      kind: "query",
      method: "GET",
    });
  }

  return Object.freeze({
    kind: "query",
    method: "GET",
    input: Object.freeze({ query: input.query }),
  });
}

export function createGetKey(
  route: readonly RouteSegment[],
  input: TreatyQuerySemanticInput | undefined,
  keyPrefix: readonly SerializableValue[] | undefined,
  cacheScope: CacheScope | undefined,
): TreatyQueryKey {
  const path = createPathKey(route);
  const operation = createOperation(input);
  const scope = cacheScope === undefined
    ? undefined
    : createCacheScopeMarker(cacheScope);

  if (keyPrefix === undefined) {
    return scope === undefined
      ? Object.freeze([namespace, path, operation])
      : Object.freeze([namespace, scope, path, operation]);
  }

  const prefix = createKeyPrefix(keyPrefix) as TreatyQueryPrefix;

  return scope === undefined
    ? Object.freeze([namespace, prefix, path, operation])
    : Object.freeze([namespace, prefix, scope, path, operation]);
}

function createMutationOperation(
  method: TreatyMutationMethod,
  query: unknown,
): TreatyMutationOperation {
  if (query === undefined) {
    return Object.freeze({
      kind: "mutation",
      method,
    });
  }

  return Object.freeze({
    kind: "mutation",
    method,
    input: Object.freeze({ query }),
  });
}

export function createMutationKey(
  route: readonly RouteSegment[],
  method: TreatyMutationMethod,
  query: unknown,
  keyPrefix: readonly SerializableValue[] | undefined,
): TreatyMutationKey {
  const path = createPathKey(route);
  const operation = createMutationOperation(method, query);

  if (keyPrefix === undefined) {
    return Object.freeze([namespace, path, operation]);
  }

  const prefix = createKeyPrefix(keyPrefix) as TreatyQueryPrefix;

  return Object.freeze([namespace, prefix, path, operation]);
}
