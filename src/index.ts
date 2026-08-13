export {
  createTreatyQuery,
  type CreateHelpersOptions,
  type CreateTreatyQueryOptions,
  type TreatyQueryClient,
  type TreatyQueryRoot,
} from "./create-treaty-query.js";
export {
  TreatyQueryError,
  type TreatyQueryErrorOptions,
} from "./error.js";
export type {
  StaticGetData,
  StaticGetError,
  StaticGetOperation,
  StaticTreatyQueryHelpers,
} from "./static-helpers.js";
export type {
  StaticTreatyQueryHooks,
  StaticUseQueryOperation,
  TreatyQueryProvider,
  TreatyQueryProviderProps,
} from "./react.js";
export type {
  SerializableValue,
  StaticGetQueryOptions,
  StaticGetQueryOptionsInput,
  TreatyQueryKey,
  TreatyQueryOperation,
  TreatyQueryPrefix,
} from "./types.js";

export const version: "0.1.0" = "0.1.0";
