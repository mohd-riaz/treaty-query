import type {
  SerializableValue,
  TreatyQueryKey,
  TreatyQueryOperation,
  TreatyQueryPrefix,
} from "./types.js";

const namespace = "treaty-query" as const;
const getOperation: TreatyQueryOperation = Object.freeze({
  kind: "query",
  method: "GET",
});

export function createStaticGetKey(
  path: readonly string[],
  keyPrefix: readonly SerializableValue[] | undefined,
): TreatyQueryKey {
  const frozenPath = Object.freeze([...path]);

  if (keyPrefix === undefined) {
    return Object.freeze([namespace, frozenPath, getOperation]);
  }

  const prefix: TreatyQueryPrefix = Object.freeze([
    "prefix",
    Object.freeze([...keyPrefix]),
  ]);

  return Object.freeze([namespace, prefix, frozenPath, getOperation]);
}
