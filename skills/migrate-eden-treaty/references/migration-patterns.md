# Treaty Query migration patterns

Use these mappings after inspecting the project's actual Elysia route types.
Names below are illustrative; rely on TypeScript inference rather than copying
them blindly.

## Shared client and providers

Keep the official Treaty client and create a separate typed Treaty Query
surface:

```tsx
import { treaty } from "@elysiajs/eden";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTreatyQuery } from "treaty-query";
import type { App } from "./server";

export const api = treaty<App>("https://api.example.com");
export const tq = createTreatyQuery<App>();
const queryClient = new QueryClient();

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

Do not create another `QueryClient` when the app already has one. Keep both the
Treaty client and `QueryClient` request-local on the server.

## GET calls

### Static route without input

```ts
// Direct Eden Treaty
const result = await api.health.get();

// React
const health = tq.health.get.useQuery();
```

The hook's `data` is the successful body, not Eden's full `{ data, error }`
result.

### Semantic query input

```ts
const products = tq.products.get.useQuery({
  query: { search, page },
});
```

Semantic query input belongs in argument one and participates in the generated
query key.

### Dynamic route in React

Use the compiler-safe marker form in React components:

```ts
const product = tq.products.$id.get.useQuery({
  params: { id: productId },
});

const orders = tq.organizations.$organizationId.orders.get.useQuery({
  params: { organizationId },
  query: { page },
});
```

For multiple dynamic groups with unique names, pass one flat object:

```ts
tq.organizations.$organizationId.orders.$orderId.get.useQuery({
  params: { organizationId, orderId },
});
```

If names repeat, pass an ordered tuple matching the dynamic route groups:

```ts
tq.groups.$id.items.$id.get.useQuery({
  params: [{ id: groupId }, { id: itemId }],
});
```

The runtime-compatible `tq.products({ id }).get.useQuery()` form remains
available, but do not introduce it into React Compiler code.

### Query transport options

Move transport-only values into argument two:

```ts
const product = tq.products.$id.get.useQuery(
  { params: { id } },
  {
    request: {
      headers: { "x-trace-id": traceId },
      fetch: { credentials: "include" },
    },
    staleTime: 30_000,
  },
);
```

TanStack owns the abort signal. Do not carry an old `fetch.signal` override
into the migration.

## Mutations

Mutation variables are the inferred Treaty body:

```ts
const createProduct = tq.products.post.useMutation({
  onSuccess(data, body) {
    console.log(data.id, body.name);
  },
});

createProduct.mutate({ name: "Latte", price: 20 });
```

Bind dynamic parameters and request options when creating the observer:

```ts
const updateProduct = tq.products.$id.patch.useMutation({
  params: { id },
  request: {
    query: { notify: true },
    headers: { "x-operation-id": operationId },
  },
});

updateProduct.mutate({ name: "Updated" });
```

POST, PUT, PATCH, and DELETE are exposed as mutations. Keep unsupported methods
on the official client.

## Existing TanStack Query code

For an incremental migration, bind helpers once and replace hand-written
query functions with ordinary TanStack options:

```ts
const helpers = tq.createHelpers({ client: api });

const query = useQuery(
  helpers.products({ id }).get.queryOptions(undefined, {
    staleTime: 30_000,
  }),
);

const mutation = useMutation(
  helpers.products.post.mutationOptions(),
);
```

Helpers use Treaty's natural callable parameter syntax because the imported
TanStack hook—not the helper route—is the statically identified React hook.

## Errors

Direct Eden code commonly branches on `result.error`. Treaty Query instead
unwraps success and rejects failures with `TreatyQueryError`:

```ts
const query = tq.account.access.get.useQuery(undefined, { retry: false });

if (query.error) {
  console.error(query.error.status, query.error.value);
}
```

If the application uses its own error class, configure `mapError` once on
`createTreatyQuery` and update consumers to handle the mapped error plus mapper
failures. Do not preserve code that expects an Eden result wrapper around
successful hook data.

## Cache scopes

Use a scope only for hidden response-changing context:

```tsx
<tq.Provider client={api}>
  <PublicApp />
  <tq.CacheScope value={["user", session.user.id]}>
    <AuthenticatedApp />
  </tq.CacheScope>
</tq.Provider>
```

Override or disable inheritance per query:

```ts
tq.account.access.get.useQuery(undefined, {
  cacheScope: ["user", session.user.id],
});

tq.countries.get.useQuery(undefined, { cacheScope: false });
```

After an identity switch, use `tq.useUtils().removeCacheScope(previousScope)`
after old consumers have unmounted or switched. A scope separates cache lookup;
it is not an authorization boundary.

## Cache utilities

Inside React, utilities inherit the nearest provider and scope:

```ts
const utils = tq.useUtils();

await utils.products.invalidate();
await utils.products({ id }).get.invalidate();

const cached = utils.products({ id }).get.getData();
utils.products({ id }).get.setData((previous) => previous);
const product = await utils.products({ id }).get.ensureData();
```

Helpers and utilities retain callable dynamic routes; `$parameterName` is a
React-hook compatibility surface.

## Loaders and SSR

Use helpers outside React:

```ts
const helpers = tq.createHelpers({ client: api });

await queryClient.ensureQueryData(
  helpers.products({ id }).get.queryOptions(),
);
```

Create the Treaty client, helpers, and `QueryClient` for each server request.
Reproduce the same prefix, scope, route parameters, and semantic input on the
browser before hydrating. Never reuse one user's dehydrated state for another.

## Custom keys

React hooks accept `queryKey` and `mutationKey` overrides:

```ts
tq.products.$id.get.useQuery(
  { params: { id } },
  { queryKey: ["application-cache", "product", id] },
);
```

An override replaces the complete generated key. Typed utilities and
`removeCacheScope` cannot match it. Prefer generated keys; when an existing
cache convention must be retained, include route/input distinctions and a safe
identity for hidden session context. Never include secrets.

## Calls that may remain direct

Keep direct Eden Treaty use when it is intentional and document it:

- HEAD, OPTIONS, CONNECT, or subscription routes not exposed by Treaty Query;
- streaming, file download, or progress-sensitive transports;
- one-shot imperative operations that should not participate in server-state
  caching;
- server-only calls where a helper plus `QueryClient` adds no useful behavior.

Do not leave duplicate direct and cached request paths active for the same UI
state unless the application deliberately coordinates them.
