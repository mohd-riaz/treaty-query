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
  MutationBody,
  MutationData,
  MutationError,
  MutationFactoryResult,
  MutationMethodName,
  MutationOperation,
  MutationOperationOptions,
  MutationRequest,
  OptionalMutationOperation,
  RequiredMutationOperation,
} from "./mutation.js";
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
  OptionalUseMutationOperation,
  OptionalUseQueryOperation,
  RequiredUseMutationOperation,
  RequiredUseQueryOperation,
  StaticTreatyQueryHooks,
  StaticUseQueryOperation,
  TreatyQueryHooks,
  TreatyQueryProvider,
  TreatyQueryProviderProps,
  UseMutationOperation,
  UseQueryOperation,
} from "./react.js";
export type {
  GetQueryOptions,
  GetQueryOptionsInput,
  MutationOptionsInput,
  SerializableValue,
  StaticGetQueryOptions,
  StaticGetQueryOptionsInput,
  TreatyQueryKey,
  TreatyMutationKey,
  TreatyMutationMethod,
  TreatyMutationOperation,
  TreatyMutationOptions,
  TreatyQueryOperation,
  TreatyQueryParameterEntry,
  TreatyQueryParameterSegment,
  TreatyQueryPathSegment,
  TreatyQueryPrefix,
  TreatyQuerySemanticInput,
} from "./types.js";

export const version: "0.1.0" = "0.1.0";
