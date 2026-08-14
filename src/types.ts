import type {
  DataTag,
  MutationFunction,
  QueryFunction,
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

export type CacheScope =
  | string
  | number
  | readonly [SerializableValue, ...SerializableValue[]];

export interface TreatyQueryPrefix {
  readonly kind: "treaty-query-prefix";
  readonly value: readonly SerializableValue[];
}

export interface TreatyQueryScope {
  readonly kind: "treaty-query-scope";
  readonly value: CacheScope;
}

export type TreatyQueryParameterEntry = readonly [string, string];

export type TreatyQueryParameterSegment = readonly [
  "$params",
  readonly TreatyQueryParameterEntry[],
];

export type TreatyQueryPathSegment = string | TreatyQueryParameterSegment;

export type TreatyQueryRouteKey =
  | readonly [
      "treaty-query",
      readonly TreatyQueryPathSegment[],
    ]
  | readonly [
      "treaty-query",
      TreatyQueryScope,
      readonly TreatyQueryPathSegment[],
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      readonly TreatyQueryPathSegment[],
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      TreatyQueryScope,
      readonly TreatyQueryPathSegment[],
    ];

export interface TreatyQuerySemanticInput {
  readonly query: unknown;
}

export interface TreatyQueryOperation {
  readonly kind: "query";
  readonly method: "GET";
  readonly input?: TreatyQuerySemanticInput;
}

export type TreatyMutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export interface TreatyMutationOperation {
  readonly kind: "mutation";
  readonly method: TreatyMutationMethod;
  readonly input?: TreatyQuerySemanticInput;
}

export type TreatyQueryKey =
  | readonly [
      "treaty-query",
      readonly TreatyQueryPathSegment[],
      TreatyQueryOperation,
    ]
  | readonly [
      "treaty-query",
      TreatyQueryScope,
      readonly TreatyQueryPathSegment[],
      TreatyQueryOperation,
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      readonly TreatyQueryPathSegment[],
      TreatyQueryOperation,
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      TreatyQueryScope,
      readonly TreatyQueryPathSegment[],
      TreatyQueryOperation,
    ];

export type TreatyMutationKey =
  | readonly [
      "treaty-query",
      readonly TreatyQueryPathSegment[],
      TreatyMutationOperation,
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      readonly TreatyQueryPathSegment[],
      TreatyMutationOperation,
    ];

export type GetQueryOptionsInput<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TreatyQueryKey>,
  "queryFn" | "queryKey"
>;

export type GetQueryOptions<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = GetQueryOptionsInput<TQueryFnData, TError, TData> & {
  readonly queryKey: DataTag<TreatyQueryKey, TQueryFnData, TError>;
  readonly queryFn: QueryFunction<TQueryFnData, TreatyQueryKey>;
};

/** @deprecated Use `GetQueryOptionsInput`. */
export type StaticGetQueryOptionsInput<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = GetQueryOptionsInput<TQueryFnData, TError, TData>;

/** @deprecated Use `GetQueryOptions`. */
export type StaticGetQueryOptions<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = GetQueryOptions<TQueryFnData, TError, TData>;

export type MutationOptionsInput<
  TData,
  TError,
  TVariables,
  TOnMutateResult = unknown,
> = Omit<
  UseMutationOptions<TData, TError, TVariables, TOnMutateResult>,
  "mutationFn" | "mutationKey"
>;

export type TreatyMutationOptions<
  TData,
  TError,
  TVariables,
  TOnMutateResult = unknown,
> = MutationOptionsInput<TData, TError, TVariables, TOnMutateResult> & {
  readonly mutationKey: TreatyMutationKey;
  readonly mutationFn: MutationFunction<TData, TVariables>;
};
