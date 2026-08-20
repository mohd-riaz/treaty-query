# React patterns

## Contents

- Installation and shared setup
- GET hooks
- Dynamic routes and React Compiler
- Mutations
- Typed cache utilities
- Cache scopes
- Errors and transport
- Custom keys
- Reserved routes and limitations

## Installation and shared setup

Install Treaty Query with its peers using the application's existing package
manager:

```sh
npm install treaty-query @elysiajs/eden @tanstack/react-query elysia react
```

Equivalent `pnpm add`, `yarn add`, and `bun add` commands are supported. The
package is ESM-only and requires Node.js 18 or a compatible Bun runtime.

Export one Treaty Query surface for each logical API. Import the Elysia app as
a type so server implementation code does not enter the client bundle:

```ts
import type { App } from "../server";
import { createTreatyQuery } from "treaty-query";

export const tq = createTreatyQuery<App>();
```

Use a distinct serializable prefix only when multiple APIs must coexist in the
same `QueryClient`:

```ts
export const adminTq = createTreatyQuery<AdminApp>({
  keyPrefix: ["admin-api"],
});
```

Provide the official client beneath TanStack's provider. Keep the client and
browser `QueryClient` stable rather than recreating them during rendering:

```tsx
import { treaty } from "@elysiajs/eden";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import type { App } from "../server";
import { tq } from "./treaty-query";

export function Root() {
  const [api] = useState(() => treaty<App>("https://api.example.com"));
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <tq.Provider client={api}>
        <Application />
      </tq.Provider>
    </QueryClientProvider>
  );
}
```

Hooks and `tq.useUtils()` must use the provider from the same `tq` instance.
Nested `tq.Provider` components select the nearest official Treaty client.

## GET hooks

Use `undefined` for an input-free GET when passing TanStack options:

```tsx
const health = tq.health.get.useQuery(undefined, {
  staleTime: 30_000,
  select: (data) => data.ok,
});
```

Place response-defining query parameters in argument one. They participate in
the generated key:

```tsx
const products = tq.products.get.useQuery({
  query: { search, page },
});
```

Use ordinary TanStack options such as `enabled`, `retry`, `staleTime`, and
`select` in argument two. Never skip the hook conditionally.

## Dynamic routes and React Compiler

In compiled React components, keep the hook property chain static and pass
route values through `params`:

```tsx
const product = tq.products.$id.get.useQuery({
  params: { id: productId },
});

const order = tq.organizations.$organizationId
  .orders.$orderId.get.useQuery({
    params: { organizationId, orderId },
    query: { includeHistory: true },
  });
```

Use an ordered tuple when parameter names repeat:

```tsx
const item = tq.groups.$id.items.$id.get.useQuery({
  params: [{ id: groupId }, { id: itemId }],
});
```

The callable form remains appropriate outside compiled hook chains:

```ts
helpers.products({ id: productId }).get.queryOptions();
utils.products({ id: productId }).get.invalidate();
```

Do not use `tq.products({ id }).get.useQuery()` inside React Compiler code. The
compiler cannot prove that a hook obtained after a render-time proxy call has a
stable identity.

## Mutations

Mutation variables are the inferred Treaty body:

```tsx
const createProduct = tq.products.post.useMutation({
  onSuccess(data, body) {
    console.log(data.id, body.name);
  },
});

createProduct.mutate({ name: "Latte", price: 20 });
```

Fix dynamic parameters and mutation query values when creating the observer:

```tsx
const utils = tq.useUtils();

const updateProduct = tq.products.$id.patch.useMutation({
  params: { id: productId },
  request: {
    query: { notify: true },
  },
  onSuccess() {
    void utils.products({ id: productId }).get.invalidate();
  },
});

updateProduct.mutate({ name: "Updated product" });
```

Bodies are excluded from mutation keys. Cache scopes apply only to queries,
not mutations.

## Typed cache utilities

Call utilities within a component or custom hook beneath both providers:

```tsx
const utils = tq.useUtils();

await utils.products.invalidate();
await utils.products({ id }).get.invalidate();

const cached = utils.products({ id }).get.getData();

utils.products({ id }).get.setData((previous) =>
  previous === undefined ? previous : { ...previous, name: "Updated" },
);

const product = await utils.products({ id }).get.ensureData();
```

Route invalidation includes descendants. GET invalidation includes every
semantic input for that endpoint. Exact operations require the same semantic
input as the corresponding query:

```ts
const input = { query: { term: "coffee" } };

const cached = utils.search.get.getData(input);
utils.search.get.setData(input, { term: "cached coffee" });
const key = utils.search.get.queryKey(input);
```

Prefer these canonical utilities for invalidation and optimistic updates so
route parameters, inputs, prefixes, and scopes stay aligned.

## Cache scopes

Scope only GET responses that vary because of hidden server context, such as a
session stored in an HTTP-only cookie:

```tsx
<tq.Provider client={api}>
  <PublicApplication />

  <tq.CacheScope value={["user", session.user.id] as const}>
    <AuthenticatedApplication />
  </tq.CacheScope>
</tq.Provider>
```

Public endpoints and routes whose path or semantic input already identifies
the data should remain unscoped. Override or disable inheritance per query:

```tsx
const access = tq.account.access.get.useQuery(undefined, {
  cacheScope: ["user", session.user.id],
});

const countries = tq.countries.get.useQuery(undefined, {
  cacheScope: false,
});
```

A scope can be a string, finite number, or non-empty readonly serializable
tuple. A plain object is not a valid top-level scope, but it may be inside a
tuple:

```ts
const scope = ["tenant-user", { tenantId, userId }] as const;
```

After components switch away from the previous identity, remove only that
scope from this Treaty Query instance:

```ts
utils.removeCacheScope(["user", previousUserId]);
```

Do not scope by a token, cookie, header, password, or credential. Do not repeat
an identifier already present in the route or semantic input. Scopes prevent
cache reuse; they do not authorize requests.

## Errors and transport

Successful results are unwrapped to the Treaty response body. Structured HTTP
failures reject with `TreatyQueryError`, which exposes `status`, `value`, and
the underlying context. Configure one application error mapping when needed:

```ts
const tq = createTreatyQuery<App, ApplicationApiError>({
  mapError(error) {
    return new ApplicationApiError(error.status, { cause: error });
  },
});
```

Transport-only values belong under `request` in options and do not enter the
key:

```tsx
const products = tq.products.get.useQuery(
  { query: { page: 1 } },
  {
    request: {
      fetch: { credentials: "include" },
      headers: { "x-trace-id": traceId },
    },
    staleTime: 30_000,
  },
);
```

Treaty Query replaces `request.fetch.signal` with TanStack Query's abort
signal. Never embed authentication transport in keys or scopes.

## Custom keys

React hooks accept complete `queryKey` and `mutationKey` replacements when an
application must join an existing key convention:

```tsx
tq.products.$id.get.useQuery(
  { params: { id } },
  { queryKey: ["application-cache", "product", id] },
);
```

Prefer generated keys. `tq.useUtils()` and `removeCacheScope()` operate on
canonical Treaty Query keys and will not match custom query keys. A custom key
must include every non-secret value that can change the response.

## Reserved routes and limitations

Escape a route segment that collides with a root member, terminal, utility, or
Promise-like property:

```ts
import { routeSegment } from "treaty-query";

tq[routeSegment]("Provider").get.useQuery();
helpers[routeSegment]("then").get.queryOptions();
utils[routeSegment]("invalidate").get.queryKey();
```

Use the official Treaty client directly for HEAD, OPTIONS, CONNECT,
subscriptions, streaming, and progress-sensitive downloads.
