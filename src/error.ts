export interface TreatyQueryErrorOptions {
  readonly response?: Response;
  readonly headers?: HeadersInit;
  readonly cause?: unknown;
}

export type TreatyQueryErrorMapper = (error: TreatyQueryError) => Error;

export class TreatyQueryError<
  TStatus extends number = number,
  TValue = unknown,
> extends Error {
  readonly status: TStatus;
  readonly value: TValue;
  override readonly cause?: unknown;
  readonly response?: Response;
  readonly headers?: HeadersInit;

  constructor(
    status: TStatus,
    value: TValue,
    options: TreatyQueryErrorOptions = {},
  ) {
    super(`Treaty request failed with status ${status}`, {
      cause: options.cause,
    });

    this.name = "TreatyQueryError";
    this.status = status;
    this.value = value;

    if (options.cause !== undefined) this.cause = options.cause;
    if (options.response !== undefined) this.response = options.response;
    if (options.headers !== undefined) this.headers = options.headers;
  }
}

export class TreatyQueryErrorMappingError extends Error {
  readonly originalError: TreatyQueryError;
  readonly mapperCause: unknown;

  constructor(originalError: TreatyQueryError, mapperCause: unknown) {
    super("Treaty Query error mapping failed.", { cause: mapperCause });
    this.name = "TreatyQueryErrorMappingError";
    this.originalError = originalError;
    this.mapperCause = mapperCause;
  }
}

export function applyTreatyQueryErrorMapper(
  error: TreatyQueryError,
  mapError?: TreatyQueryErrorMapper,
): Error {
  if (mapError === undefined) return error;

  try {
    const mapped = mapError(error);
    if (!(mapped instanceof Error)) {
      throw new TypeError("Treaty Query mapError must return an Error.");
    }

    return mapped;
  } catch (cause) {
    throw new TreatyQueryErrorMappingError(error, cause);
  }
}
