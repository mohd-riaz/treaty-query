import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  QueryClient,
  QueryClientProvider,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Elysia, t } from "elysia";
import { type ReactElement } from "react";

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
});
