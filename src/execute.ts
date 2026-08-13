import { TreatyQueryError } from "./error.js";

export interface StaticGetRequestOptions {
  readonly fetch: {
    readonly signal: AbortSignal;
  };
  readonly throwHttpError: false;
}

export type StaticGetMethod = (
  options?: StaticGetRequestOptions,
) => Promise<unknown>;

interface TreatyResult {
  readonly data: unknown;
  readonly error: unknown;
  readonly status?: unknown;
  readonly response?: unknown;
  readonly headers?: unknown;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function isTreatyResult(value: unknown): value is TreatyResult {
  return isRecord(value) && "data" in value && "error" in value;
}

function getStatus(result: TreatyResult): number {
  if (isRecord(result.error) && typeof result.error.status === "number") {
    return result.error.status;
  }

  if (typeof result.status === "number") return result.status;
  return 500;
}

function getErrorValue(error: unknown): unknown {
  return isRecord(error) && "value" in error ? error.value : error;
}

function getResponse(value: unknown): Response | undefined {
  return value instanceof Response ? value : undefined;
}

function getHeaders(value: unknown): HeadersInit | undefined {
  if (value instanceof Headers || Array.isArray(value) || isRecord(value)) {
    return value as HeadersInit;
  }

  return undefined;
}

export async function executeStaticGet(
  method: StaticGetMethod,
  signal: AbortSignal,
): Promise<unknown> {
  let result: unknown;

  try {
    result = await method({
      fetch: { signal },
      throwHttpError: false,
    });
  } catch (cause) {
    if (isRecord(cause) && typeof cause.status === "number") {
      throw new TreatyQueryError(cause.status, getErrorValue(cause), { cause });
    }

    throw cause;
  }

  if (!isTreatyResult(result)) {
    throw new TypeError("Treaty GET returned an invalid structured result.");
  }

  if (result.error !== null) {
    const response = getResponse(result.response);
    const headers = getHeaders(result.headers);

    throw new TreatyQueryError(getStatus(result), getErrorValue(result.error), {
      cause: result.error,
      ...(response === undefined ? {} : { response }),
      ...(headers === undefined ? {} : { headers }),
    });
  }

  return result.data === undefined ? null : result.data;
}
