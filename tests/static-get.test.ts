import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia, t } from "elysia";

import { createTreatyQuery, TreatyQueryError } from "../src/index";

let healthCalls = 0;

const app = new Elysia()
  .get(
    "/health",
    () => {
      healthCalls += 1;
      return { ok: true };
    },
    {
      response: {
        200: t.Object({ ok: t.Boolean() }),
      },
    },
  )
  .get(
    "/failure",
    ({ status }) => status(401, { code: "NO_ACCESS" as const }),
    {
      response: {
        401: t.Object({ code: t.Literal("NO_ACCESS") }),
      },
    },
  )
  .get("/search", ({ query }) => ({ term: query.term }), {
    query: t.Object({ term: t.String() }),
  })
  .get("/products/:id", ({ params }) => ({ id: params.id }))
  .get(
    "/organizations/:organizationId/orders/:orderId",
    ({ params, query }) => ({
      organizationId: params.organizationId,
      orderId: params.orderId,
      page: query.page,
    }),
    {
      query: t.Object({ page: t.Number() }),
    },
  );

const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const helpers = tq.createHelpers({ client });

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends
  (<T>() => T extends TRight ? 1 : 2)
    ? true
    : false;

type Expect<TValue extends true> = TValue;

describe("static GET query options", () => {
  test("builds an immutable, namespaced key without executing the request", () => {
    healthCalls = 0;

    const options = helpers.health.get.queryOptions(undefined, {
      staleTime: 10_000,
    });

    expect(healthCalls).toBe(0);
    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(options.staleTime).toBe(10_000);
    expect(Object.isFrozen(options.queryKey)).toBe(true);
    expect(Object.isFrozen(options.queryKey[1])).toBe(true);
    expect(Object.isFrozen(options.queryKey.at(-1))).toBe(true);
  });

  test("unwraps successful Treaty data through QueryClient", async () => {
    healthCalls = 0;
    const queryClient = createQueryClient();
    const options = helpers.health.get.queryOptions();

    type QueryData = Awaited<ReturnType<typeof options.queryFn>>;
    type _DataIsInferred = Expect<Equal<QueryData, { ok: boolean }>>;
    const typeCheck: _DataIsInferred = true;

    const data = await queryClient.fetchQuery(options);
    const cachedData = queryClient.getQueryData(options.queryKey);

    type CachedData = typeof cachedData;
    type _TaggedKeyInfersData = Expect<
      Equal<CachedData, { ok: boolean } | undefined>
    >;
    const taggedKeyTypeCheck: _TaggedKeyInfersData = true;

    expect(typeCheck).toBe(true);
    expect(taggedKeyTypeCheck).toBe(true);
    expect(data).toEqual({ ok: true });
    expect(healthCalls).toBe(1);
    expect(cachedData).toEqual({ ok: true });
  });

  test("preserves select inference in caller options", () => {
    const options = helpers.health.get.queryOptions(undefined, {
      select: (data) => (data.ok ? "up" : "down"),
    });

    const selected = options.select?.({ ok: true });
    const expected: "up" | "down" | undefined = selected;

    expect(expected).toBe("up");
  });

  test("throws a structured TreatyQueryError for HTTP failures", async () => {
    const queryClient = createQueryClient();
    const options = helpers.failure.get.queryOptions(undefined, {
      retry: false,
    });

    try {
      await queryClient.fetchQuery(options);
      throw new Error("Expected the Treaty request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(TreatyQueryError);

      if (!(error instanceof TreatyQueryError)) throw error;

      expect(error.status).toBe(401);
      expect(error.value).toEqual({ code: "NO_ACCESS" });
      expect(error.response).toBeInstanceOf(Response);
      expect(error.cause).toBeDefined();
    }
  });

  test("forwards the TanStack abort signal to Treaty", async () => {
    let forwardedSignal: AbortSignal | null | undefined;
    const remoteClient = treaty<typeof app>("https://example.test", {
      fetcher: (async (_input, init) => {
        forwardedSignal = init?.signal;
        return Response.json({ ok: true });
      }) as typeof fetch,
    });
    const remoteHelpers = tq.createHelpers({ client: remoteClient });
    const options = remoteHelpers.health.get.queryOptions();
    const queryClient = createQueryClient();
    const controller = new AbortController();

    await options.queryFn({
      client: queryClient,
      meta: undefined,
      queryKey: options.queryKey,
      signal: controller.signal,
    });

    expect(forwardedSignal).toBe(controller.signal);
  });

  test("overrides a throwing Treaty client and normalizes transport errors", async () => {
    const transportCause = new Error("offline");
    const remoteClient = treaty<typeof app>("https://example.test", {
      throwHttpError: true,
      fetcher: (async () => {
        throw transportCause;
      }) as unknown as typeof fetch,
    });
    const remoteHelpers = tq.createHelpers({ client: remoteClient });
    const queryClient = createQueryClient();

    try {
      await queryClient.fetchQuery(
        remoteHelpers.health.get.queryOptions(undefined, { retry: false }),
      );
      throw new Error("Expected the transport request to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(TreatyQueryError);

      if (!(error instanceof TreatyQueryError)) throw error;

      expect(error.status).toBe(503);
      expect(error.value).toBe(transportCause);
      expect(error.response).toBeUndefined();
    }
  });

  test("places a configured prefix immediately after the namespace", () => {
    const prefixed = createTreatyQuery<typeof app>({
      keyPrefix: ["acme-api", 2],
    }).createHelpers({ client });

    expect(
      prefixed.health.get.queryOptions().queryKey as readonly unknown[],
    ).toEqual([
      "treaty-query",
      ["prefix", ["acme-api", 2]],
      ["health"],
      { kind: "query", method: "GET" },
    ]);
  });

  test("includes required semantic query input in the key and request", async () => {
    const options = helpers.search.get.queryOptions({
      query: { term: "coffee" },
    });

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["search"],
      {
        kind: "query",
        method: "GET",
        input: { query: { term: "coffee" } },
      },
    ]);
    expect(await createQueryClient().fetchQuery(options)).toEqual({
      term: "coffee",
    });

    if (false) {
      // @ts-expect-error The search route requires its declared query input.
      helpers.search.get.queryOptions();
      // @ts-expect-error The inferred query object requires term.
      helpers.search.get.queryOptions({ query: {} });
    }
  });

  test("keeps transport options out of keys and lets TanStack own the signal", async () => {
    let forwardedSignal: AbortSignal | null | undefined;
    let forwardedTrace: string | null = null;
    let forwardedUrl = "";
    const remoteClient = treaty<typeof app>("https://example.test", {
      fetcher: (async (input, init) => {
        forwardedUrl = String(input);
        forwardedSignal = init?.signal;
        forwardedTrace = new Headers(init?.headers).get("x-trace-id");
        return Response.json({ term: "coffee" });
      }) as typeof fetch,
    });
    const remoteHelpers = tq.createHelpers({ client: remoteClient });
    const controller = new AbortController();
    const options = remoteHelpers.search.get.queryOptions(
      { query: { term: "coffee" } },
      {
        request: {
          headers: { "x-trace-id": "trace-1" },
          fetch: { credentials: "include" },
        },
        staleTime: 2_000,
      },
    );

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["search"],
      {
        kind: "query",
        method: "GET",
        input: { query: { term: "coffee" } },
      },
    ]);
    expect("request" in options).toBe(false);

    await options.queryFn({
      client: createQueryClient(),
      meta: undefined,
      queryKey: options.queryKey,
      signal: controller.signal,
    });

    expect(forwardedUrl).toBe("https://example.test/search?term=coffee");
    expect(forwardedTrace as string | null).toBe("trace-1");
    expect(forwardedSignal).toBe(controller.signal);

    if (false) {
      remoteHelpers.search.get.queryOptions(
        { query: { term: "coffee" } },
        {
          request: {
            fetch: {
              // @ts-expect-error TanStack owns the request AbortSignal.
              signal: controller.signal,
            },
          },
        },
      );
    }
  });

  test("uses semantic query input to separate cached data", async () => {
    const queryClient = createQueryClient();
    const coffee = helpers.search.get.queryOptions({
      query: { term: "coffee" },
    });
    const tea = helpers.search.get.queryOptions({
      query: { term: "tea" },
    });

    expect(coffee.queryKey).not.toEqual(tea.queryKey);
    await queryClient.fetchQuery(coffee);
    await queryClient.fetchQuery(tea);

    expect(queryClient.getQueryData<{ term: string }>(coffee.queryKey)).toEqual({
      term: "coffee",
    });
    expect(queryClient.getQueryData<{ term: string }>(tea.queryKey)).toEqual({
      term: "tea",
    });
  });

  test("captures and normalizes a numeric dynamic path parameter", async () => {
    const options = helpers.products({ id: 42 }).get.queryOptions();

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["products", ["$params", [["id", "42"]]]],
      { kind: "query", method: "GET" },
    ]);
    expect(await createQueryClient().fetchQuery(options)).toEqual({ id: "42" });

    if (false) {
      // @ts-expect-error Dynamic route parameters are required.
      void helpers.products().get;
      // @ts-expect-error The inferred parameter name is id.
      void helpers.products({ productId: "42" }).get;
    }
  });

  test("preserves nested dynamic parameter positions", async () => {
    const options = helpers
      .organizations({ organizationId: "org-1" })
      .orders({ orderId: "order-9" })
      .get.queryOptions({ query: { page: 2 } });

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      [
        "organizations",
        ["$params", [["organizationId", "org-1"]]],
        "orders",
        ["$params", [["orderId", "order-9"]]],
      ],
      {
        kind: "query",
        method: "GET",
        input: { query: { page: 2 } },
      },
    ]);
    expect(await createQueryClient().fetchQuery(options)).toEqual({
      organizationId: "org-1",
      orderId: "order-9",
      page: 2,
    });
  });
});
