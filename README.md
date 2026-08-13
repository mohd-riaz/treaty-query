# treaty-query

Type-safe TanStack Query bindings for Elysia Treaty clients.

> **Status:** early development. GET option factories and React `useQuery`
> hooks support semantic query input and dynamic path parameters. POST, PUT,
> PATCH, and DELETE mutations are implemented. Cache scopes and typed cache
> utilities are not implemented yet.

## React useQuery

Create one Treaty Query instance, provide an existing official Treaty client,
and keep TanStack's ordinary `QueryClientProvider`:

```tsx
import { treaty } from "@elysiajs/eden";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { App } from "./server";
import { createTreatyQuery } from "treaty-query";

const api = treaty<App>("https://api.example.com");
const queryClient = new QueryClient();
const tq = createTreatyQuery<App>();

export function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <tq.Provider client={api}>
        <Application />
      </tq.Provider>
    </QueryClientProvider>
  );
}
```

GET hooks infer their input, data, and error types from the Treaty client:

```tsx
function Health() {
  const health = tq.health.get.useQuery(undefined, {
    staleTime: 30_000,
    select: (data) => data.ok,
  });

  return <span>{health.data ? "up" : "down"}</span>;
}
```

Semantic query input belongs in argument one and participates in the cache key:

```tsx
const products = tq.products.get.useQuery({
  query: { search: "coffee", page: 1 },
});
```

Dynamic route parameters use Treaty's natural call syntax:

```tsx
const product = tq.products({ id: productId }).get.useQuery();

const order = tq.organizations({ organizationId })
  .orders({ orderId })
  .get.useQuery();
```

A hook must be rendered under the `Provider` from the same
`createTreatyQuery()` instance. Nested providers use the nearest client.

## GET query options

Bind an existing official Treaty client to create ordinary TanStack Query
options outside React:

```ts
const helpers = tq.createHelpers({ client: api });

const healthOptions = helpers.health.get.queryOptions(undefined, {
  staleTime: 30_000,
});

const health = await queryClient.fetchQuery(healthOptions);
```

Hooks and helpers share the exact key builder and execution path. Creating
options is lazy. Successful Treaty data is unwrapped, the TanStack abort signal
is forwarded, and failed results throw `TreatyQueryError`.

Transport-only data belongs under `request` in argument two. It is forwarded
to Treaty but excluded from the cache key:

```ts
const options = helpers.products.get.queryOptions(
  { query: { page: 1 } },
  {
    request: {
      headers: { "x-trace-id": traceId },
      fetch: { credentials: "include" },
    },
    staleTime: 30_000,
  },
);
```

The adapter owns `fetch.signal` and replaces it with TanStack's signal. Never
put tokens, cookies, authorization headers, credentials, or other secrets in
semantic input, path parameters, key prefixes, or cache scopes.

Conceptually, a query with nested path parameters and query input produces:

```ts
[
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
    input: { query: { page: 1 } },
  },
]
```

An optional application prefix can isolate multiple APIs:

```ts
const tq = createTreatyQuery<App>({
  keyPrefix: ["admin-api"],
});
```

## Mutations

Mutation variables are the inferred Treaty body directly:

```tsx
const createProduct = tq.products.post.useMutation({
  onSuccess(data, body) {
    console.log(data.id, body.name);
  },
});

createProduct.mutate({
  name: "Latte",
  price: 20,
});
```

Dynamic parameters stay captured by the route. Mutation query parameters,
headers, and fetch settings are static for that mutation observer:

```tsx
const updateProduct = tq.products({ id }).patch.useMutation({
  request: {
    query: { notify: true },
    headers: { "x-operation-id": operationId },
  },
});

updateProduct.mutate({ name: "Updated product" });
```

Outside React, the same operation factory is available from bound helpers:

```ts
const options = helpers.products.post.mutationOptions({
  onSuccess(data, body) {
    console.log(data, body);
  },
});
```

Mutation keys include the library namespace, optional API prefix, positional
route parameters, HTTP method, and static semantic query parameters. Bodies,
headers, and fetch configuration are excluded. Mutation keys are not cache
entries and will not receive the planned cache scope.

Mutation query parameters are intentionally fixed when the mutation observer
is created. Create another observer when those parameters need to change.

## Planned cache scopes

Session-dependent queries will be able to opt into a cache scope, while public
queries remain unscoped and shareable. A cache scope is for hidden server
context—not a mandatory tenant feature—and must never contain secrets.

## Development

Development uses [Bun](https://bun.sh/):

```sh
bun install
bun run check-types
bun test
bun run build
bun pm pack
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing changes.

## License

MIT
