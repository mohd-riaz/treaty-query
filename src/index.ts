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
  GetData,
  GetError,
  GetInput,
  GetOperation,
  GetOperationOptions,
  GetRequest,
  OptionalGetOperation,
  RequiredGetOperation,
  StaticGetData,
  StaticGetError,
  StaticGetOperation,
  StaticTreatyQueryHelpers,
  TreatyQueryHelpers,
} from "./static-helpers.js";
export type {
  OptionalUseQueryOperation,
  RequiredUseQueryOperation,
  StaticTreatyQueryHooks,
  StaticUseQueryOperation,
  TreatyQueryHooks,
  TreatyQueryProvider,
  TreatyQueryProviderProps,
  UseQueryOperation,
} from "./react.js";
export type {
  GetQueryOptions,
  GetQueryOptionsInput,
  SerializableValue,
  StaticGetQueryOptions,
  StaticGetQueryOptionsInput,
  TreatyQueryKey,
  TreatyQueryOperation,
  TreatyQueryParameterEntry,
  TreatyQueryParameterSegment,
  TreatyQueryPathSegment,
  TreatyQueryPrefix,
  TreatyQuerySemanticInput,
} from "./types.js";

export const version: "0.1.0" = "0.1.0";
