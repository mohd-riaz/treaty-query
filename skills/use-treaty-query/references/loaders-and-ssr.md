# Loaders and SSR

## Contents

- Bound helpers
- Router loaders
- Runtime lifetimes
- Prefetching and hydration
- Scoped server data
- Verification checklist

## Bound helpers

Create ordinary TanStack options outside React by binding the official Treaty
client:

```ts
const helpers = tq.createHelpers({ client: api });

const productOptions = helpers.products({ id }).get.queryOptions(undefined, {
  staleTime: 30_000,
});

const product = await queryClient.fetchQuery(productOptions);
```

Option creation is lazy. Helpers and hooks use the same request execution,
error normalization, and canonical key builder.

Helpers also expose mutation option factories for TanStack's static hook:

```tsx
import { useMutation } from "@tanstack/react-query";

const mutation = useMutation(
  helpers.products.post.mutationOptions({
    onSuccess(data, body) {
      console.log(data.id, body.name);
    },
  }),
);
```

## Router loaders

Pass both the QueryClient and client-bound helpers through router context. Do
not close loader factories over a server-global QueryClient:

```ts
interface RouterContext {
  queryClient: QueryClient;
  helpers: ReturnType<typeof tq.createHelpers>;
}

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
```

Migrate the loader, component query, invalidations, and optimistic updates for
one feature together so every consumer uses the same canonical key.

## Runtime lifetimes

The `tq = createTreatyQuery<App>()` surface can be module-global. It holds
configuration and type-driven proxies, not Query cache data.

Create a fresh runtime for every server request:

```ts
import type { Treaty } from "@elysiajs/eden";

function createRuntime(api: Treaty.Create<App>) {
  const queryClient = new QueryClient();
  const helpers = tq.createHelpers({ client: api });

  return { api, queryClient, helpers };
}

export function createServerRuntime(request: Request) {
  const api = createRequestTreatyClient(request);
  return createRuntime(api);
}
```

The application owns `createRequestTreatyClient`. It must bind the normal
request transport safely without moving cookies, tokens, or authorization
headers into Treaty Query keys.

One stable browser runtime may be reused for the browser application lifetime:

```ts
let browserRuntime: ReturnType<typeof createRuntime> | undefined;

export function getBrowserRuntime() {
  return browserRuntime ??= createRuntime(treaty<App>(API_URL));
}
```

Do not share a server QueryClient, request-bound Treaty client, helpers, router
instance, or dehydrated cache across requests.

## Prefetching and hydration

Prefetch with helper-generated options, dehydrate the request-local
QueryClient, then hydrate an equivalent browser key:

```ts
await queryClient.ensureQueryData(
  helpers.products({ id }).get.queryOptions(),
);

const state = dehydrate(queryClient);
```

```tsx
<QueryClientProvider client={runtime.queryClient}>
  <HydrationBoundary state={dehydratedState}>
    <tq.Provider client={runtime.api}>
      <Application />
    </tq.Provider>
  </HydrationBoundary>
</QueryClientProvider>
```

Server and browser must use the same Treaty Query key prefix, route values,
semantic query input, and cache scope. Helper factories deliberately keep
canonical keys; do not give the browser hook a custom key when expecting it to
hydrate helper-prefetched data.

Use the framework's safe serialization mechanism when embedding dehydrated
state in HTML. Raw `JSON.stringify()` alone does not provide HTML/XSS escaping.

## Scoped server data

Create public and session-scoped helpers separately when hidden request context
changes some responses:

```ts
const publicHelpers = tq.createHelpers({ client: api });
const sessionHelpers = tq.createHelpers({
  client: api,
  cacheScope: ["user", session.user.id],
});

await Promise.all([
  queryClient.ensureQueryData(
    publicHelpers.countries.get.queryOptions(),
  ),
  queryClient.ensureQueryData(
    sessionHelpers.account.access.get.queryOptions(),
  ),
]);
```

Recreate the same non-secret scope in the browser before reading the hydrated
entry. Never send one user's dehydrated state to another user or persist scoped
state after logout.

## Verification checklist

- Assert a new QueryClient and request-bound Treaty client are created per
  server request.
- Compare server and browser `queryKey` values for prefetched operations.
- Confirm hydration avoids a duplicate initial request when data is fresh.
- Confirm distinct request identities cannot read one another's scoped data.
- Confirm public data remains unscoped and reusable.
- Exercise HTTP errors, transport errors, cancellation, and route error
  boundaries; `ensureQueryData` rejects on failure.
- Confirm no credential appears in keys, dehydration output, fixtures, or
  logs.
