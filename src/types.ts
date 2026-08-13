import type {
  DataTag,
  QueryFunction,
  UseQueryOptions,
} from "@tanstack/react-query";

export type SerializableValue =
  | null
  | boolean
  | number
  | string
  | readonly SerializableValue[]
  | { readonly [key: string]: SerializableValue };

export type TreatyQueryPrefix = readonly [
  "prefix",
  readonly SerializableValue[],
];

export type TreatyQueryParameterEntry = readonly [string, string];

export type TreatyQueryParameterSegment = readonly [
  "$params",
  readonly TreatyQueryParameterEntry[],
];

export type TreatyQueryPathSegment = string | TreatyQueryParameterSegment;

export interface TreatyQuerySemanticInput {
  readonly query: unknown;
}

export interface TreatyQueryOperation {
  readonly kind: "query";
  readonly method: "GET";
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
      TreatyQueryPrefix,
      readonly TreatyQueryPathSegment[],
      TreatyQueryOperation,
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
