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
  .get("/products/:id", ({ params }) => ({ id: params.id }))
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
  .get("/products/:id", ({ params }) => ({ id: params.id }))
  .post(
    "/products",
    ({ body }) => ({ id: "alternate-1", name: body.name, price: body.price }),
    {
      body: t.Object({ name: t.String(), price: t.Number() }),
    },
  );
const alternateClient = treaty(alternateApp);

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
      ["scope", "parent"],
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(keys).toContainEqual([
      "treaty-query",
      ["scope", ["user", { id: "child" }]],
      ["health"],
      { kind: "query", method: "GET" },
    ]);
    expect(keys).toContainEqual([
      "treaty-query",
      ["scope", "per-query"],
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
      ["scope", "user-a"],
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
});
