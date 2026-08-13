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

export interface TreatyQueryOperation {
  readonly kind: "query";
  readonly method: "GET";
}

export type TreatyQueryKey =
  | readonly [
      "treaty-query",
      readonly string[],
      TreatyQueryOperation,
    ]
  | readonly [
      "treaty-query",
      TreatyQueryPrefix,
      readonly string[],
      TreatyQueryOperation,
    ];

export type StaticGetQueryOptionsInput<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TreatyQueryKey>,
  "queryFn" | "queryKey"
>;

export type StaticGetQueryOptions<
  TQueryFnData,
  TError,
  TData = TQueryFnData,
> = StaticGetQueryOptionsInput<TQueryFnData, TError, TData> & {
  readonly queryKey: DataTag<TreatyQueryKey, TQueryFnData, TError>;
  readonly queryFn: QueryFunction<TQueryFnData, TreatyQueryKey>;
};
