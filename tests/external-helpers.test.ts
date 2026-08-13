import { describe, expect, test } from "bun:test";
import { treaty } from "@elysiajs/eden";
import {
  dehydrate,
  hydrate,
  QueryClient,
  type DehydratedState,
} from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { Elysia } from "elysia";

import {
  createTreatyQuery,
  type TreatyQueryHelpers,
} from "../src/index";

const app = new Elysia()
  .get("/countries", () => ({ names: ["Freedonia", "Sylvania"] }))
  .get("/account/access", () => ({ user: "server-default" }))
  .get("/products/:id", ({ params }) => ({
    id: params.id,
    name: `Product ${params.id}`,
  }));

type App = typeof app;
type Client = ReturnType<typeof treaty<App>>;

const tq = createTreatyQuery<App>({ keyPrefix: ["external-tests"] });

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 60_000,
      },
    },
  });
}

function cloneDehydratedState(state: DehydratedState): DehydratedState {
  return JSON.parse(JSON.stringify(state)) as DehydratedState;
}

function createRequestClient(
  user: "user-a" | "user-b",
  calls: { account: number; countries: number },
): Client {
  return treaty<App>("https://example.test", {
    fetcher: (async (input: Parameters<typeof fetch>[0]) => {
      const pathname = new URL(String(input)).pathname;

      if (pathname === "/countries") {
        calls.countries += 1;
        return Response.json({ names: ["Freedonia", "Sylvania"] });
      }

      if (pathname === "/account/access") {
        calls.account += 1;
        return Response.json({ user });
      }

      throw new Error(`Unexpected test URL: ${pathname}`);
    }) as unknown as typeof fetch,
  });
}

interface RouterContext {
  readonly queryClient: QueryClient;
  readonly helpers: TreatyQueryHelpers<Client>;
}

describe("external helpers", () => {
  test("work in a real TanStack Router loader", async () => {
    const queryClient = createQueryClient();
    const client = treaty(app);
    const helpers = tq.createHelpers({ client });
    const rootRoute = createRootRouteWithContext<RouterContext>()();
    const productRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/products/$productId",
      loader: ({ context, params }) =>
        context.queryClient.ensureQueryData(
          context.helpers
            .products({ id: params.productId })
            .get.queryOptions(),
        ),
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([productRoute]),
      context: { queryClient, helpers },
      history: createMemoryHistory({
        initialEntries: ["/products/42"],
      }),
      defaultPreloadStaleTime: 0,
    });

    await router.load();

    const options = helpers.products({ id: "42" }).get.queryOptions();
    expect(
      queryClient.getQueryData<{ id: string; name: string }>(options.queryKey),
    ).toEqual({
      id: "42",
      name: "Product 42",
    });
    expect(router.state.matches.at(-1)?.loaderData).toEqual({
      id: "42",
      name: "Product 42",
    });
  });

  test("keeps request clients and QueryClients isolated", async () => {
    const callsA = { account: 0, countries: 0 };
    const callsB = { account: 0, countries: 0 };
    const clientA = createRequestClient("user-a", callsA);
    const clientB = createRequestClient("user-b", callsB);
    const queryClientA = createQueryClient();
    const queryClientB = createQueryClient();
    const publicA = tq.createHelpers({ client: clientA });
    const publicB = tq.createHelpers({ client: clientB });
    const scopedA = tq.createHelpers({
      client: clientA,
      cacheScope: ["user", "user-a"],
    });
    const scopedB = tq.createHelpers({
      client: clientB,
      cacheScope: ["user", "user-b"],
    });
    const accountA = scopedA.account.access.get.queryOptions();
    const accountB = scopedB.account.access.get.queryOptions();
    const countriesA = publicA.countries.get.queryOptions();
    const countriesB = publicB.countries.get.queryOptions();

    await Promise.all([
      queryClientA.ensureQueryData(accountA),
      queryClientA.ensureQueryData(countriesA),
      queryClientB.ensureQueryData(accountB),
      queryClientB.ensureQueryData(countriesB),
    ]);

    expect(queryClientA.getQueryData<{ user: string }>(accountA.queryKey)).toEqual({
      user: "user-a",
    });
    expect(queryClientB.getQueryData<{ user: string }>(accountB.queryKey)).toEqual({
      user: "user-b",
    });
    expect(queryClientA.getQueryData(accountB.queryKey)).toBeUndefined();
    expect(queryClientB.getQueryData(accountA.queryKey)).toBeUndefined();
    expect(countriesA.queryKey).toEqual(countriesB.queryKey);
    expect(callsA).toEqual({ account: 1, countries: 1 });
    expect(callsB).toEqual({ account: 1, countries: 1 });
  });

  test("preserves public and scoped keys across dehydration and hydration", async () => {
    const calls = { account: 0, countries: 0 };
    const serverClient = createRequestClient("user-a", calls);
    const serverQueryClient = createQueryClient();
    const serverPublic = tq.createHelpers({ client: serverClient });
    const serverScoped = tq.createHelpers({
      client: serverClient,
      cacheScope: ["user", { id: "user-a" }],
    });
    const serverCountries = serverPublic.countries.get.queryOptions();
    const serverAccount = serverScoped.account.access.get.queryOptions();

    await Promise.all([
      serverQueryClient.ensureQueryData(serverCountries),
      serverQueryClient.ensureQueryData(serverAccount),
    ]);

    const transportedState = cloneDehydratedState(
      dehydrate(serverQueryClient),
    );
    const browserQueryClient = createQueryClient();
    hydrate(browserQueryClient, transportedState);

    const browserClient = createRequestClient("user-a", calls);
    const browserPublic = tq.createHelpers({ client: browserClient });
    const browserScoped = tq.createHelpers({
      client: browserClient,
      cacheScope: ["user", { id: "user-a" }],
    });
    const browserCountries = browserPublic.countries.get.queryOptions();
    const browserAccount = browserScoped.account.access.get.queryOptions();

    expect(browserCountries.queryKey).toEqual(serverCountries.queryKey);
    expect(browserAccount.queryKey).toEqual(serverAccount.queryKey);
    expect(
      browserQueryClient.getQueryData<{ names: string[] }>(
        browserCountries.queryKey,
      ),
    ).toEqual({
      names: ["Freedonia", "Sylvania"],
    });
    expect(
      browserQueryClient.getQueryData<{ user: string }>(browserAccount.queryKey),
    ).toEqual({
      user: "user-a",
    });

    await browserQueryClient.ensureQueryData(browserCountries);
    await browserQueryClient.ensureQueryData(browserAccount);
    expect(calls).toEqual({ account: 1, countries: 1 });
  });

  test("does not read a hydrated previous scope through the current scope", async () => {
    const callsA = { account: 0, countries: 0 };
    const callsB = { account: 0, countries: 0 };
    const clientA = createRequestClient("user-a", callsA);
    const clientB = createRequestClient("user-b", callsB);
    const serverA = createQueryClient();
    const helpersA = tq.createHelpers({
      client: clientA,
      cacheScope: ["user", "user-a"],
    });
    const helpersB = tq.createHelpers({
      client: clientB,
      cacheScope: ["user", "user-b"],
    });
    const accountA = helpersA.account.access.get.queryOptions();
    const accountB = helpersB.account.access.get.queryOptions();

    await serverA.ensureQueryData(accountA);

    const browserB = createQueryClient();
    hydrate(browserB, cloneDehydratedState(dehydrate(serverA)));

    expect(browserB.getQueryData(accountB.queryKey)).toBeUndefined();
    expect(await browserB.ensureQueryData(accountB)).toEqual({ user: "user-b" });
    expect(browserB.getQueryData<{ user: string }>(accountA.queryKey)).toEqual({
      user: "user-a",
    });
    expect(browserB.getQueryData<{ user: string }>(accountB.queryKey)).toEqual({
      user: "user-b",
    });
    expect(callsA.account).toBe(1);
    expect(callsB.account).toBe(1);
  });
});
