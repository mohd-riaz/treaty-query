export interface TreatyQueryErrorOptions {
  readonly response?: Response;
  readonly headers?: HeadersInit;
  readonly cause?: unknown;
}

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
