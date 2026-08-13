import type { RouteSegment } from "./route.js";
import type {
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
  TreatyQuerySemanticInput,
} from "./types.js";

const namespace = "treaty-query" as const;

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
        : createParameterKey(segment.value),
    ),
  );
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
): TreatyQueryKey {
  const path = createPathKey(route);
  const operation = createOperation(input);

  if (keyPrefix === undefined) {
    return Object.freeze([namespace, path, operation]);
  }

  const prefix: TreatyQueryPrefix = Object.freeze([
    "prefix",
    Object.freeze([...keyPrefix]),
  ]);

  return Object.freeze([namespace, prefix, path, operation]);
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

  const prefix: TreatyQueryPrefix = Object.freeze([
    "prefix",
    Object.freeze([...keyPrefix]),
  ]);

  return Object.freeze([namespace, prefix, path, operation]);
}
