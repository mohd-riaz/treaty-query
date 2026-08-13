import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import { Elysia, t } from "elysia";

import {
  createTreatyQuery,
  type CacheScope,
} from "../src/index";

const app = new Elysia()
  .get("/account/access", () => ({ user: "server-default" }))
  .get(
    "/organizations/:organizationId/access",
    ({ params, query }) => ({
      organizationId: params.organizationId,
      detail: query.detail,
    }),
    {
      query: t.Object({ detail: t.String() }),
    },
  )
  .post("/account/refresh", () => ({ refreshed: true }));

type App = typeof app;

function createUserClient(user: string, calls: { value: number }) {
  return treaty<App>("https://example.test", {
    fetcher: (async () => {
      calls.value += 1;
      return Response.json({ user });
    }) as unknown as typeof fetch,
  });
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Number.POSITIVE_INFINITY,
      },
    },
  });
}

const tq = createTreatyQuery<App>();

describe("cache scope option factories", () => {
  test("separates session-dependent data for two users", async () => {
    const userACalls = { value: 0 };
    const userBCalls = { value: 0 };
    const userA = tq.createHelpers({
      client: createUserClient("user-a-result", userACalls),
      cacheScope: "user-a",
    });
    const userB = tq.createHelpers({
      client: createUserClient("user-b-result", userBCalls),
      cacheScope: "user-b",
    });
    const queryClient = createQueryClient();
    const userAOptions = userA.account.access.get.queryOptions();
    const userBOptions = userB.account.access.get.queryOptions();

    expect(userAOptions.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["scope", "user-a"],
      ["account", "access"],
      { kind: "query", method: "GET" },
    ]);
    expect(userAOptions.queryKey).not.toEqual(userBOptions.queryKey);

    expect(await queryClient.fetchQuery(userAOptions)).toEqual({
      user: "user-a-result",
    });
    expect(await queryClient.fetchQuery(userBOptions)).toEqual({
      user: "user-b-result",
    });
    expect(queryClient.getQueryData<{ user: string }>(userAOptions.queryKey)).toEqual({
      user: "user-a-result",
    });
    expect(queryClient.getQueryData<{ user: string }>(userBOptions.queryKey)).toEqual({
      user: "user-b-result",
    });
    expect(userACalls.value).toBe(1);
    expect(userBCalls.value).toBe(1);
  });

  test("keeps public unscoped data shareable", async () => {
    const firstCalls = { value: 0 };
    const secondCalls = { value: 0 };
    const first = tq.createHelpers({
      client: createUserClient("public-result", firstCalls),
    });
    const second = tq.createHelpers({
      client: createUserClient("unused-result", secondCalls),
    });
    const queryClient = createQueryClient();
    const firstOptions = first.account.access.get.queryOptions();
    const secondOptions = second.account.access.get.queryOptions();

    expect(firstOptions.queryKey).toEqual(secondOptions.queryKey);
    expect(await queryClient.fetchQuery(firstOptions)).toEqual({
      user: "public-result",
    });
    expect(await queryClient.fetchQuery(secondOptions)).toEqual({
      user: "public-result",
    });
    expect(firstCalls.value).toBe(1);
    expect(secondCalls.value).toBe(0);
  });

  test("lets a query override or disable its inherited scope", () => {
    const calls = { value: 0 };
    const helpers = tq.createHelpers({
      client: createUserClient("result", calls),
      cacheScope: "parent",
    });

    expect(
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: "override",
      }).queryKey as readonly unknown[],
    ).toEqual([
      "treaty-query",
      ["scope", "override"],
      ["account", "access"],
      { kind: "query", method: "GET" },
    ]);
    expect(
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: false,
      }).queryKey as readonly unknown[],
    ).toEqual([
      "treaty-query",
      ["account", "access"],
      { kind: "query", method: "GET" },
    ]);

    const prefixed = createTreatyQuery<App>({
      keyPrefix: ["admin-api"],
    }).createHelpers({
      client: createUserClient("result", calls),
      cacheScope: "parent",
    });
    expect(
      prefixed.account.access.get.queryOptions().queryKey as readonly unknown[],
    ).toEqual([
      "treaty-query",
      ["prefix", ["admin-api"]],
      ["scope", "parent"],
      ["account", "access"],
      { kind: "query", method: "GET" },
    ]);
  });

  test("supports immutable serializable tuples and snapshots their values", () => {
    const object = { id: "user-a" };
    const scope = ["user", object, 2] as const;
    const calls = { value: 0 };
    const options = tq
      .createHelpers({
        client: createUserClient("result", calls),
        cacheScope: scope,
      })
      .account.access.get.queryOptions();

    object.id = "changed-after-binding";

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["scope", ["user", { id: "user-a" }, 2]],
      ["account", "access"],
      { kind: "query", method: "GET" },
    ]);
    expect(Object.isFrozen(options.queryKey[1])).toBe(true);
    expect(Object.isFrozen((options.queryKey[1] as readonly unknown[])[1])).toBe(
      true,
    );
  });

  test("retains path parameters and query input normally", () => {
    const helpers = tq.createHelpers({ client: treaty(app) });
    const options = helpers
      .organizations({ organizationId: "org-1" })
      .access.get.queryOptions(
        { query: { detail: "full" } },
        { cacheScope: "user-a" },
      );

    expect(options.queryKey as readonly unknown[]).toEqual([
      "treaty-query",
      ["scope", "user-a"],
      ["organizations", ["$params", [["organizationId", "org-1"]]], "access"],
      {
        kind: "query",
        method: "GET",
        input: { query: { detail: "full" } },
      },
    ]);
  });

  test("validates scope values and keeps mutations unscoped", () => {
    const helpers = tq.createHelpers({ client: treaty(app) });
    const circular: unknown[] = [];
    circular.push(circular);

    expect(() =>
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: Number.NaN,
      }),
    ).toThrow("finite");
    expect(() =>
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: [new Date()] as unknown as CacheScope,
      }),
    ).toThrow("plain objects");
    expect(() =>
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: circular as unknown as CacheScope,
      }),
    ).toThrow("circular");
    expect(() =>
      helpers.account.access.get.queryOptions(undefined, {
        cacheScope: [
          { [Symbol("not-serializable")]: "value" },
        ] as unknown as CacheScope,
      }),
    ).toThrow("symbol keys");

    const scopedHelpers = tq.createHelpers({
      client: treaty(app),
      cacheScope: "user-a",
    });
    expect(
      scopedHelpers.account.refresh.post.mutationOptions().mutationKey,
    ).toEqual([
      "treaty-query",
      ["account", "refresh"],
      { kind: "mutation", method: "POST" },
    ]);

    if (false) {
      // @ts-expect-error A top-level object is not a cache scope; use a tuple.
      helpers.account.access.get.queryOptions(undefined, { cacheScope: { id: "a" } });
    }
  });
});
