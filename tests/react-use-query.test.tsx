import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Elysia, t } from "elysia";
import { type ReactElement } from "react";

import {
  createTreatyQuery,
  routeSegment,
  TreatyQueryError,
  type CacheScope,
  type TreatyQueryUtils,
} from "../src/index";

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
    ({ status }) => status(403, { code: "FORBIDDEN" as const }),
    {
      response: {
        403: t.Object({ code: t.Literal("FORBIDDEN") }),
      },
    },
  )
  .get("/search", ({ query }) => ({ term: query.term }), {
    query: t.Object({ term: t.String() }),
  })
  .get("/scope/admin", () => ({ route: "public-scope-admin" as const }))
  .get("/products/:id", ({ params }) => ({ id: params.id }))
  .get(
    "/organizations/:organizationId/orders/:orderId",
    ({ params }) => ({
      organizationId: params.organizationId,
      orderId: params.orderId,
    }),
  )
  .patch(
    "/products/:id",
    ({ params, body }) => ({ id: params.id, name: body.name }),
    {
      body: t.Object({ name: t.String() }),
    },
  )
  .post(
    "/products",
    ({ body }) => ({ id: "created-1", name: body.name, price: body.price }),
    {
      body: t.Object({ name: t.String(), price: t.Number() }),
    },
  );

const client = treaty(app);
const tq = createTreatyQuery<typeof app>();
const alternateApp = new Elysia()
  .get("/health", () => ({ ok: false }), {
    response: {
      200: t.Object({ ok: t.Boolean() }),
    },
  })
  .get(
    "/failure",
    ({ status }) => status(403, { code: "FORBIDDEN" as const }),
    {
      response: {
        403: t.Object({ code: t.Literal("FORBIDDEN") }),
      },
    },
  )
  .get("/search", ({ query }) => ({ term: query.term }), {
    query: t.Object({ term: t.String() }),
  })
  .get("/scope/admin", () => ({ route: "alternate-scope-admin" as const }))
  .get("/products/:id", ({ params }) => ({ id: params.id }))
  .get(
    "/organizations/:organizationId/orders/:orderId",
    ({ params }) => ({
      organizationId: params.organizationId,
      orderId: params.orderId,
    }),
  )
  .patch(
    "/products/:id",
    ({ params, body }) => ({ id: params.id, name: body.name }),
    {
      body: t.Object({ name: t.String() }),
    },
  )
  .post(
    "/products",
    ({ body }) => ({ id: "alternate-1", name: body.name, price: body.price }),
    {
      body: t.Object({ name: t.String(), price: t.Number() }),
    },
  );
const alternateClient = treaty(alternateApp);
const collisionApp = new Elysia()
  .get("/then", () => ({ route: "then" as const }))
  .get("/catch", () => ({ route: "catch" as const }))
  .get("/finally", () => ({ route: "finally" as const }))
  .get("/get", () => ({ route: "get" as const }))
  .post("/post", () => ({ route: "post" as const }))
  .get("/Provider", () => ({ route: "Provider" as const }))
  .get("/invalidate", () => ({ route: "invalidate" as const }))
  .get("/queryKey", () => ({ route: "queryKey" as const }))
  .get("/queryOptions", () => ({ route: "queryOptions" as const }))
  .get("/useQuery", () => ({ route: "useQuery" as const }))
  .get("/constructor", () => ({ route: "constructor" as const }))
  .get("/toString", () => ({ route: "toString" as const }));
const collisionClient = treaty(collisionApp);
const collisionTq = createTreatyQuery<typeof collisionApp>();

GlobalRegistrator.register({
  url: "http://localhost/",
});

const { act, cleanup, render, waitFor } = await import("@testing-library/react");

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function Providers(props: {
  readonly children: ReactElement;
  readonly queryClient: QueryClient;
}): ReactElement {
  return (
    <QueryClientProvider client={props.queryClient}>
      <tq.Provider client={client}>{props.children}</tq.Provider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
afterAll(() => GlobalRegistrator.unregister());

describe("React static GET useQuery", () => {
  test("renders pending and successful states through real providers", async () => {
    healthCalls = 0;
    const statuses: string[] = [];
    let latestData: { ok: boolean } | undefined;
    const queryClient = createQueryClient();

    function Probe(): null {
      const result = tq.health.get.useQuery();
      statuses.push(result.status);
      latestData = result.data;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => expect(latestData).toEqual({ ok: true }));

    const helperKey = tq
      .createHelpers({ client })
      .health.get.queryOptions().queryKey;

    expect(statuses).toContain("pending");
    expect(statuses).toContain("success");
    expect(queryClient.getQueryData<{ ok: boolean }>(helperKey)).toEqual({
      ok: true,
    });
    expect(healthCalls).toBe(1);
  });

  test("accepts TanStack options as the second argument with select inference", async () => {
    let selected: "up" | "down" | undefined;

    function Probe(): null {
      const result = tq.health.get.useQuery(undefined, {
        select: (data) => (data.ok ? "up" as const : "down" as const),
        staleTime: 5_000,
      });

      selected = result.data;
      return null;
    }

    render(
      <Providers queryClient={createQueryClient()}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => expect(selected).toBe("up"));
  });

  test("lets React queries replace the generated query key", async () => {
    const queryClient = createQueryClient();
    const queryKey = ["application-cache", "product", 7] as const;
    let productData: { id: string } | undefined;

    function Probe(): null {
      productData = tq.products.$id.get.useQuery(
        { params: { id: 7 } },
        { queryKey },
      ).data;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => expect(productData).toEqual({ id: "7" }));

    const generatedKey = tq.createHelpers({ client })
      .products({ id: 7 }).get.queryOptions().queryKey;

    expect(queryClient.getQueryData<{ id: string }>(queryKey)).toEqual({
      id: "7",
    });
    expect(queryClient.getQueryData(generatedKey)).toBeUndefined();
  });

  test("surfaces TreatyQueryError in the hook error state", async () => {
    let latest: UseQueryResult<unknown, Error> | undefined;

    function Probe(): null {
      latest = tq.failure.get.useQuery(undefined, { retry: false });
      return null;
    }

    render(
      <Providers queryClient={createQueryClient()}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => expect(latest?.status).toBe("error"));

    expect(latest?.error).toBeInstanceOf(TreatyQueryError);

    if (!(latest?.error instanceof TreatyQueryError)) {
      throw latest?.error ?? new Error("Expected a TreatyQueryError.");
    }

    expect(latest.error.status).toBe(403);
    expect(latest.error.value).toEqual({ code: "FORBIDDEN" });
  });

  test("does not execute a disabled query", async () => {
    healthCalls = 0;
    let status: string | undefined;

    function Probe(): null {
      status = tq.health.get.useQuery(undefined, { enabled: false }).status;
      return null;
    }

    render(
      <Providers queryClient={createQueryClient()}>
        <Probe />
      </Providers>,
    );

    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(status).toBe("pending");
    expect(healthCalls).toBe(0);
  });

  test("throws a clear error outside its own Provider", () => {
    const otherTq = createTreatyQuery<typeof app>();

    function Probe(): null {
      otherTq.health.get.useQuery();
      return null;
    }

    expect(() =>
      render(
        <Providers queryClient={createQueryClient()}>
          <Probe />
        </Providers>,
      ),
    ).toThrow("inside this tq.Provider");
  });

  test("uses the nearest nested Provider client", async () => {
    let latestData: { ok: boolean } | undefined;

    function Probe(): null {
      latestData = tq.health.get.useQuery().data;
      return null;
    }

    render(
      <QueryClientProvider client={createQueryClient()}>
        <tq.Provider client={client}>
          <tq.Provider client={alternateClient}>
            <Probe />
          </tq.Provider>
        </tq.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(latestData).toEqual({ ok: false }));
  });

  test("executes required query input and dynamic path hooks", async () => {
    let searchData: { term: string } | undefined;
    let productData: { id: string } | undefined;

    function Probe(): null {
      searchData = tq.search.get.useQuery({
        query: { term: "latte" },
      }).data;
      productData = tq.products({ id: 7 }).get.useQuery().data;
      return null;
    }

    render(
      <Providers queryClient={createQueryClient()}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(searchData).toEqual({ term: "latte" });
      expect(productData).toEqual({ id: "7" });
    });

    if (false) {
      // @ts-expect-error The search hook requires semantic query input.
      tq.search.get.useQuery();
    }
  });

  test("keeps compiler-safe dynamic query hooks on a static property chain", async () => {
    const queryClient = createQueryClient();
    let productData: { id: string } | undefined;
    let orderData:
      | { organizationId: string; orderId: string }
      | undefined;

    function Probe(): null {
      productData = tq.products.$id.get.useQuery({
        params: { id: 7 },
      }).data;
      orderData = tq.organizations.$organizationId.orders.$orderId.get
        .useQuery({
          params: { organizationId: "org-1", orderId: "order-9" },
        }).data;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    await waitFor(() => {
      expect(productData).toEqual({ id: "7" });
      expect(orderData).toEqual({
        organizationId: "org-1",
        orderId: "order-9",
      });
    });

    expect(
      queryClient.getQueryCache().getAll().map((query) => query.queryKey),
    ).toContainEqual([
      "treaty-query",
      ["products", ["$params", [["id", "7"]]]],
      { kind: "query", method: "GET" },
    ]);

    if (false) {
      // @ts-expect-error Compiler-safe dynamic routes require params.
      tq.products.$id.get.useQuery();
      tq.products.$id.get.useQuery({
        // @ts-expect-error The inferred dynamic parameter name is id.
        params: { productId: 7 },
      });
      // @ts-expect-error Parameter marker names come from the Treaty route.
      tq.products.$productId.get.useQuery({ params: { productId: 7 } });
    }
  });

  test("keeps compiler-safe dynamic mutation hooks on a static property chain", async () => {
    const queryClient = createQueryClient();
    let mutate:
      | ((body: { name: string }) => Promise<{ id: string; name: string }>)
      | undefined;
    let callbackId: string | undefined;
    let latestStatus: string | undefined;

    function Probe(): null {
      const mutation = tq.products.$id.patch.useMutation({
        params: { id: 11 },
        onSuccess(data, body) {
          callbackId = `${data.id}:${body.name}`;
        },
      });
      mutate = mutation.mutateAsync;
      latestStatus = mutation.status;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    let result: { id: string; name: string } | undefined;
    await act(async () => {
      result = await mutate?.({ name: "Updated" });
    });

    await waitFor(() => expect(latestStatus).toBe("success"));

    expect(result).toEqual({ id: "11", name: "Updated" });
    expect(callbackId).toBe("11:Updated");
    expect(
      queryClient.getMutationCache().getAll()[0]?.options.mutationKey,
    ).toEqual([
      "treaty-query",
      ["products", ["$params", [["id", "11"]]]],
      { kind: "mutation", method: "PATCH" },
    ]);

    if (false) {
      // @ts-expect-error Compiler-safe dynamic mutations require params.
      tq.products.$id.patch.useMutation();
    }
  });

  test("lets React mutations replace the generated mutation key", async () => {
    const queryClient = createQueryClient();
    const mutationKey = ["application-mutations", "product", 12] as const;
    let mutate:
      | ((body: { name: string }) => Promise<{ id: string; name: string }>)
      | undefined;
    let latestStatus: string | undefined;

    function Probe(): null {
      const mutation = tq.products.$id.patch.useMutation({
        params: { id: 12 },
        mutationKey,
      });
      mutate = mutation.mutateAsync;
      latestStatus = mutation.status;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    await act(async () => {
      await mutate?.({ name: "Custom key" });
    });

    await waitFor(() => expect(latestStatus).toBe("success"));
    expect(
      queryClient.getMutationCache().getAll()[0]?.options.mutationKey,
    ).toEqual(mutationKey);
  });

  test("returns stable hook functions for compiler-safe property chains", () => {
    expect(tq.health.get.useQuery).toBe(tq.health.get.useQuery);
    expect(tq.products.post.useMutation).toBe(tq.products.post.useMutation);
    expect(tq.products.$id.get.useQuery).toBe(
      tq.products.$id.get.useQuery,
    );
    expect(tq.products.$id.patch.useMutation).toBe(
      tq.products.$id.patch.useMutation,
    );
  });

  test("executes a typed body mutation through the shared factory", async () => {
    const queryClient = createQueryClient();
    let mutate:
      | ((body: { name: string; price: number }) => Promise<{
          id: string;
          name: string;
          price: number;
        }>)
      | undefined;
    let latestStatus: string | undefined;
    let callbackBodyName: string | undefined;
    let callbackResultId: string | undefined;

    function Probe(): null {
      const mutation = tq.products.post.useMutation({
        onSuccess(data, body) {
          callbackResultId = data.id;
          callbackBodyName = body.name;
        },
      });

      mutate = mutation.mutateAsync;
      latestStatus = mutation.status;
      return null;
    }

    render(
      <Providers queryClient={queryClient}>
        <Probe />
      </Providers>,
    );

    let result: Awaited<ReturnType<NonNullable<typeof mutate>>> | undefined;
    await act(async () => {
      result = await mutate?.({ name: "Latte", price: 20 });
    });

    await waitFor(() => expect(latestStatus).toBe("success"));

    expect(result).toEqual({
      id: "created-1",
      name: "Latte",
      price: 20,
    });
    expect(callbackResultId).toBe("created-1");
    expect(callbackBodyName).toBe("Latte");
    expect(
      queryClient.getMutationCache().getAll()[0]?.options.mutationKey,
    ).toEqual([
      "treaty-query",
      ["products"],
      { kind: "mutation", method: "POST" },
    ]);
  });

  test("uses the nearest CacheScope with per-query override and disable", () => {
    const queryClient = createQueryClient();

    function Probe(props: {
      readonly cacheScope?: CacheScope | false;
    }): null {
      tq.health.get.useQuery(undefined, {
        enabled: false,
        ...(props.cacheScope === undefined
          ? {}
          : { cacheScope: props.cacheScope }),
      });
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <tq.Provider client={client}>
          <tq.CacheScope value="parent">
            <Probe />
            <tq.CacheScope value={["user", { id: "child" }] as const}>
              <Probe />
              <Probe cacheScope="per-query" />
              <Probe cacheScope={false} />
            </tq.CacheScope>
          </tq.CacheScope>
        </tq.Provider>
      </QueryClientProvider>,
    );

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey);
    expect(keys).toContainEqual([
      "treaty-query",
      { kind: "treaty-query-scope", value: "parent" },
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(keys).toContainEqual([
      "treaty-query",
      {
        kind: "treaty-query-scope",
        value: ["user", { id: "child" }],
      },
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(keys).toContainEqual([
      "treaty-query",
      { kind: "treaty-query-scope", value: "per-query" },
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(keys).toContainEqual([
      "treaty-query",
      ["health"],
      { kind: "query", method: "GET" },
    ]);
  });

  test("removes only the exact previous scope from this API prefix", () => {
    const queryClient = createQueryClient();
    const prefixedTq = createTreatyQuery<typeof app>({
      keyPrefix: ["admin-api"],
    });
    const helpers = tq.createHelpers({ client });
    const prefixedHelpers = prefixedTq.createHelpers({ client });
    const previous = helpers.health.get.queryOptions(undefined, {
      cacheScope: ["user", { id: "previous" }] as const,
    }).queryKey;
    const current = helpers.health.get.queryOptions(undefined, {
      cacheScope: ["user", { id: "current" }] as const,
    }).queryKey;
    const publicKey = helpers.health.get.queryOptions().queryKey;
    const otherPrefix = prefixedHelpers.health.get.queryOptions(undefined, {
      cacheScope: ["user", { id: "previous" }] as const,
    }).queryKey;
    const unrelated = ["another-library", "health"] as const;
    let utils: TreatyQueryUtils<typeof client> | undefined;

    queryClient.setQueryData(previous as QueryKey, "previous");
    queryClient.setQueryData(current as QueryKey, "current");
    queryClient.setQueryData(publicKey as QueryKey, "public");
    queryClient.setQueryData(otherPrefix as QueryKey, "other-prefix");
    queryClient.setQueryData(unrelated, "unrelated");

    function Probe(): null {
      utils = tq.useUtils();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <tq.Provider client={client}>
          <Probe />
        </tq.Provider>
      </QueryClientProvider>,
    );

    act(() => {
      utils?.removeCacheScope(["user", { id: "previous" }] as const);
    });

    expect(queryClient.getQueryData(previous as QueryKey)).toBeUndefined();
    expect(queryClient.getQueryData<string>(current as QueryKey)).toBe("current");
    expect(queryClient.getQueryData<string>(publicKey as QueryKey)).toBe("public");
    expect(queryClient.getQueryData<string>(otherPrefix as QueryKey)).toBe(
      "other-prefix",
    );
    expect(queryClient.getQueryData<string>(unrelated)).toBe("unrelated");
  });

  test("keeps literal /scope/admin routes distinct from scope metadata", async () => {
    const queryClient = createQueryClient();
    const helpers = tq.createHelpers({ client });
    const scopedHelpers = tq.createHelpers({ client, cacheScope: "admin" });
    const publicRoute = helpers.scope.admin.get.queryOptions();
    const scopedProduct = scopedHelpers.products({ id: 7 }).get.queryOptions();
    let utils: TreatyQueryUtils<typeof client> | undefined;

    queryClient.setQueryData(publicRoute.queryKey, {
      route: "public-scope-admin",
    });
    queryClient.setQueryData(scopedProduct.queryKey, { id: "7" });

    function Probe(): null {
      utils = tq.useUtils();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <tq.Provider client={client}>
          <Probe />
        </tq.Provider>
      </QueryClientProvider>,
    );

    if (utils === undefined) throw new Error("Expected utilities.");
    const resolvedUtils = utils;

    await act(async () => {
      await resolvedUtils.scope.admin.invalidate({ refetchType: "none" });
    });

    expect(queryClient.getQueryCache().find({
      queryKey: publicRoute.queryKey,
      exact: true,
    })?.state.isInvalidated).toBe(true);
    expect(queryClient.getQueryCache().find({
      queryKey: scopedProduct.queryKey,
      exact: true,
    })?.state.isInvalidated).toBe(false);

    act(() => resolvedUtils.removeCacheScope("admin"));

    expect(queryClient.getQueryData<{
      readonly route: "public-scope-admin";
    }>(publicRoute.queryKey)).toEqual({ route: "public-scope-admin" });
    expect(queryClient.getQueryData(scopedProduct.queryKey)).toBeUndefined();
  });

  test("keeps prefixed literal scope routes distinct from scope metadata", async () => {
    const queryClient = createQueryClient();
    const prefixedTq = createTreatyQuery<typeof app>({
      keyPrefix: ["admin-api"],
    });
    const helpers = prefixedTq.createHelpers({ client });
    const scopedHelpers = prefixedTq.createHelpers({
      client,
      cacheScope: "admin",
    });
    const publicRoute = helpers.scope.admin.get.queryOptions();
    const scopedProduct = scopedHelpers.products({ id: 7 }).get.queryOptions();
    let utils: TreatyQueryUtils<typeof client> | undefined;

    queryClient.setQueryData(publicRoute.queryKey, {
      route: "public-scope-admin",
    });
    queryClient.setQueryData(scopedProduct.queryKey, { id: "7" });

    function Probe(): null {
      utils = prefixedTq.useUtils();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <prefixedTq.Provider client={client}>
          <Probe />
        </prefixedTq.Provider>
      </QueryClientProvider>,
    );

    if (utils === undefined) throw new Error("Expected utilities.");
    const resolvedUtils = utils;

    await act(async () => {
      await resolvedUtils.scope.admin.invalidate({ refetchType: "none" });
    });

    expect(queryClient.getQueryCache().find({
      queryKey: publicRoute.queryKey,
      exact: true,
    })?.state.isInvalidated).toBe(true);
    expect(queryClient.getQueryCache().find({
      queryKey: scopedProduct.queryKey,
      exact: true,
    })?.state.isInvalidated).toBe(false);

    act(() => resolvedUtils.removeCacheScope("admin"));

    expect(queryClient.getQueryData<{
      readonly route: "public-scope-admin";
    }>(publicRoute.queryKey)).toEqual({ route: "public-scope-admin" });
    expect(queryClient.getQueryData(scopedProduct.queryKey)).toBeUndefined();
  });

  test("provides typed exact cache reads, writes, keys, and ensureData", async () => {
    const queryClient = createQueryClient();
    let utils: TreatyQueryUtils<typeof client> | undefined;

    function Probe(): null {
      utils = tq.useUtils();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <tq.Provider client={client}>
          <tq.CacheScope value="user-a">
            <Probe />
          </tq.CacheScope>
        </tq.Provider>
      </QueryClientProvider>,
    );

    if (utils === undefined) throw new Error("Expected utilities.");

    const helperKey = tq
      .createHelpers({ client, cacheScope: "user-a" })
      .products({ id: 7 })
      .get.queryOptions().queryKey;
    expect(utils.products({ id: 7 }).get.queryKey()).toEqual(helperKey);

    const written = utils.products({ id: 7 }).get.setData((previous) => ({
      id: previous?.id ?? "7",
    }));
    expect(written).toEqual({ id: "7" });

    const product = utils.products({ id: 7 }).get.getData();
    const typedProduct: { id: string } | undefined = product;
    expect(typedProduct).toEqual({ id: "7" });

    utils.search.get.setData(
      { query: { term: "coffee" } },
      { term: "cached-coffee" },
    );
    expect(
      utils.search.get.getData({ query: { term: "coffee" } }),
    ).toEqual({ term: "cached-coffee" });

    utils.products({ id: 7 }).get.setData(
      undefined,
      { id: "public-7" },
      { cacheScope: false },
    );
    expect(
      utils.products({ id: 7 }).get.getData(undefined, {
        cacheScope: false,
      }),
    ).toEqual({ id: "public-7" });
    expect(utils.products({ id: 7 }).get.getData()).toEqual({ id: "7" });

    healthCalls = 0;
    const ensured = await utils.health.get.ensureData(undefined, {
      staleTime: 10_000,
    });
    expect(ensured).toEqual({ ok: true });
    expect(healthCalls).toBe(1);
    expect(
      queryClient.getQueryData<{ ok: boolean }>(
        tq.createHelpers({ client, cacheScope: "user-a" })
          .health.get.queryOptions().queryKey,
      ),
    ).toEqual({ ok: true });

    if (false) {
      // @ts-expect-error Required semantic query input cannot be omitted.
      utils.search.get.getData();
      // @ts-expect-error The updater must preserve the endpoint data type.
      utils.products({ id: 7 }).get.setData(() => ({ missing: true }));
      // @ts-expect-error Dynamic route parameters retain their Treaty type.
      utils.products({ productId: 7 }).get.getData();
    }
  });

  test("invalidates route and GET prefixes only within the inherited scope", async () => {
    const queryClient = createQueryClient();
    let utils: TreatyQueryUtils<typeof client> | undefined;

    function Probe(): null {
      utils = tq.useUtils();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <tq.Provider client={client}>
          <tq.CacheScope value="user-a">
            <Probe />
          </tq.CacheScope>
        </tq.Provider>
      </QueryClientProvider>,
    );

    if (utils === undefined) throw new Error("Expected utilities.");

    const helpers = tq.createHelpers({ client });
    const productA1 = helpers.products({ id: 1 }).get.queryOptions(undefined, {
      cacheScope: "user-a",
    }).queryKey;
    const productA2 = helpers.products({ id: 2 }).get.queryOptions(undefined, {
      cacheScope: "user-a",
    }).queryKey;
    const productB = helpers.products({ id: 1 }).get.queryOptions(undefined, {
      cacheScope: "user-b",
    }).queryKey;
    const publicProduct = helpers.products({ id: 1 }).get.queryOptions().queryKey;
    const coffee = helpers.search.get.queryOptions(
      { query: { term: "coffee" } },
      { cacheScope: "user-a" },
    ).queryKey;
    const tea = helpers.search.get.queryOptions(
      { query: { term: "tea" } },
      { cacheScope: "user-a" },
    ).queryKey;

    for (const key of [productA1, productA2, productB, publicProduct, coffee, tea]) {
      queryClient.setQueryData(key as QueryKey, "seeded");
    }

    expect(utils.products.queryKey()).toEqual([
      "treaty-query",
      { kind: "treaty-query-scope", value: "user-a" },
      ["products"],
    ]);

    await act(async () => {
      await utils?.products.invalidate({ refetchType: "none" });
    });

    expect(queryClient.getQueryState(productA1)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(productA2)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(productB)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(publicProduct)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(coffee)?.isInvalidated).toBe(false);

    await act(async () => {
      await utils?.products.invalidate({
        cacheScope: false,
        refetchType: "none",
      });
    });

    expect(queryClient.getQueryState(publicProduct)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(productB)?.isInvalidated).toBe(false);

    await act(async () => {
      await utils?.search.get.invalidate({ refetchType: "none" });
    });

    expect(queryClient.getQueryState(coffee)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(tea)?.isInvalidated).toBe(true);
  });

  test("escapes reserved route names without making proxies promise-like", async () => {
    const queryClient = createQueryClient();
    const helpers = collisionTq.createHelpers({ client: collisionClient });
    let thenData: { route: "then" } | undefined;
    let providerData: { route: "Provider" } | undefined;
    let invalidationKey: readonly unknown[] | undefined;

    expect(await Promise.resolve(helpers)).toBe(helpers);
    expect((helpers as { readonly then?: unknown }).then).toBeUndefined();
    expect((helpers as { readonly catch?: unknown }).catch).toBeUndefined();
    expect((helpers as { readonly finally?: unknown }).finally).toBeUndefined();
    expect((collisionTq as { readonly then?: unknown }).then).toBeUndefined();

    expect(
      await queryClient.fetchQuery(
        helpers[routeSegment]("then").get.queryOptions(),
      ),
    ).toEqual({ route: "then" });
    expect(
      await queryClient.fetchQuery(
        helpers[routeSegment]("catch").get.queryOptions(),
      ),
    ).toEqual({ route: "catch" });
    expect(
      await queryClient.fetchQuery(
        helpers[routeSegment]("finally").get.queryOptions(),
      ),
    ).toEqual({ route: "finally" });
    expect(
      await queryClient.fetchQuery(
        helpers[routeSegment]("get").get.queryOptions(),
      ),
    ).toEqual({ route: "get" });
    expect(
      await queryClient.fetchQuery(
        helpers.constructor.get.queryOptions(),
      ),
    ).toEqual({ route: "constructor" });
    expect(
      await queryClient.fetchQuery(
        helpers.toString.get.queryOptions(),
      ),
    ).toEqual({ route: "toString" });
    expect(
      await queryClient.fetchQuery(
        helpers.queryOptions.get.queryOptions(),
      ),
    ).toEqual({ route: "queryOptions" });
    expect(
      await queryClient.fetchQuery(
        helpers.useQuery.get.queryOptions(),
      ),
    ).toEqual({ route: "useQuery" });

    const post = helpers[routeSegment]("post").post.mutationOptions();
    expect(
      await post.mutationFn(undefined, {
        client: queryClient,
        meta: undefined,
        mutationKey: post.mutationKey,
      }),
    ).toEqual({ route: "post" });

    function Probe(): null {
      thenData = collisionTq[routeSegment]("then").get.useQuery().data;
      providerData = collisionTq[routeSegment]("Provider").get.useQuery().data;
      invalidationKey = collisionTq
        .useUtils()
        [routeSegment]("invalidate")
        .get.queryKey();
      return null;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <collisionTq.Provider client={collisionClient}>
          <Probe />
        </collisionTq.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(thenData).toEqual({ route: "then" });
      expect(providerData).toEqual({ route: "Provider" });
    });
    expect(invalidationKey).toEqual([
      "treaty-query",
      ["invalidate"],
      { kind: "query", method: "GET" },
    ]);

    expect(() =>
      (helpers[routeSegment] as (segment: string) => unknown)(""),
    ).toThrow("cannot be empty");
  });
});
