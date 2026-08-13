import {
  applyTreatyQueryErrorMapper,
  TreatyQueryError,
  type TreatyQueryErrorMapper,
} from "./error.js";

export interface StaticGetRequestOptions {
  readonly query?: unknown;
  readonly headers?: unknown;
  readonly fetch: RequestInit;
  readonly throwHttpError: false;
}

export interface GetTransportOptions {
  readonly headers?: unknown;
  readonly fetch?: RequestInit;
}

export type StaticGetMethod = (
  options?: StaticGetRequestOptions,
) => Promise<unknown>;

export interface MutationRequestOptions extends GetTransportOptions {
  readonly query?: unknown;
}

export interface MutationTreatyRequestOptions extends MutationRequestOptions {
  readonly throwHttpError: false;
}

export type MutationMethod = (
  body: unknown,
  options?: MutationTreatyRequestOptions,
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

async function executeTreatyRequest(
  invoke: () => Promise<unknown>,
  mapError?: TreatyQueryErrorMapper,
): Promise<unknown> {
  let result: unknown;
  try {
    result = await invoke();
  } catch (cause) {
    if (isRecord(cause) && typeof cause.status === "number") {
      throw applyTreatyQueryErrorMapper(
        new TreatyQueryError(cause.status, getErrorValue(cause), { cause }),
        mapError,
      );
    }

    throw cause;
  }

  if (!isTreatyResult(result)) {
    throw new TypeError("Treaty returned an invalid structured result.");
  }

  if (result.error !== null) {
    const response = getResponse(result.response);
    const headers = getHeaders(result.headers);

    throw applyTreatyQueryErrorMapper(
      new TreatyQueryError(getStatus(result), getErrorValue(result.error), {
        cause: result.error,
        ...(response === undefined ? {} : { response }),
        ...(headers === undefined ? {} : { headers }),
      }),
      mapError,
    );
  }

  if (result.status === 204 || result.status === 205) return null;
  return result.data === undefined ? null : result.data;
}

export async function executeStaticGet(
  method: StaticGetMethod,
  signal: AbortSignal,
  input?: { readonly query?: unknown },
  request?: GetTransportOptions,
  mapError?: TreatyQueryErrorMapper,
): Promise<unknown> {
  return executeTreatyRequest(
    () =>
      method({
        ...request,
        ...(input?.query === undefined ? {} : { query: input.query }),
        fetch: { ...request?.fetch, signal },
        throwHttpError: false,
      }),
    mapError,
  );
}

export async function executeMutation(
  method: MutationMethod,
  body: unknown,
  request?: MutationRequestOptions,
  mapError?: TreatyQueryErrorMapper,
): Promise<unknown> {
  return executeTreatyRequest(
    () =>
      method(body, {
        ...request,
        throwHttpError: false,
      }),
    mapError,
  );
}
