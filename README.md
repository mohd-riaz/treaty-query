# treaty-query

tRPC-style TanStack Query DX for Elysia Treaty, using the official client with
no code generation or custom transport.

> **Status:** Treaty Query is available on
> [npm](https://www.npmjs.com/package/treaty-query). The project is still in
> early `0.x` development, so review the changelog when upgrading.

## Installation

Install Treaty Query alongside its peer dependencies with your preferred
package manager.

Using npm:

```sh
npm install treaty-query @elysiajs/eden @tanstack/react-query elysia react
```

Using pnpm:

```sh
pnpm add treaty-query @elysiajs/eden @tanstack/react-query elysia react
```

Using Yarn:

```sh
yarn add treaty-query @elysiajs/eden @tanstack/react-query elysia react
```

Using Bun:

```sh
bun add treaty-query @elysiajs/eden @tanstack/react-query elysia react
```

The package is ESM-only and requires Node.js 18 or newer (or a compatible Bun
runtime). See [the tested compatibility matrix](./docs/compatibility.md) before
choosing peer versions.

## Why Treaty Query?

Elysia Treaty provides the end-to-end typed client. Treaty Query layers a
tRPC-style route-proxy experience over that client for TanStack Query:

```ts
tq.account.access.get.useQuery();
tq.products.$id.patch.useMutation({ params: { id } });
await tq.useUtils().products.invalidate();
```

You keep Treaty's official request transport and TanStack Query's normal
`QueryClient`, cache, devtools, hydration, persistence, and plugins. Treaty
Query does not generate code or introduce another RPC protocol.

“tRPC-style” describes the developer experience only. This project is not
affiliated with tRPC and does not use or implement the tRPC runtime or protocol.

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

For React Compiler-compatible dynamic routes, use the inferred `$parameter`
properties and pass their values under `params`:

```tsx
const product = tq.products.$id.get.useQuery({
  params: { id: productId },
});

const order = tq.organizations.$organizationId
  .orders.$orderId.get.useQuery({
    params: { organizationId, orderId },
  });
```

The marker names are inferred from Treaty's route-parameter types. They are
resolved to ordinary Treaty route calls when the hook runs, and the parameter
values remain in their normal positions in the query key. For multiple dynamic
route groups, a flat `params` object is convenient when names are unique. An
ordered tuple is also accepted and supports repeated parameter names:

```tsx
const item = tq.groups.$id.items.$id.get.useQuery({
  params: [{ id: groupId }, { id: itemId }],
});
```

Treaty's natural callable syntax remains available for helpers, cache
utilities, and backward-compatible runtime use. React Compiler cannot prove a
hook obtained after a render-time route call is stable, so compiled components
should use the `$parameter` form:

```ts
helpers.products({ id: productId }).get.queryOptions();
utils.products({ id: productId }).get.invalidate();
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

Configure a global mapper when the application has its own API error class.
The second generic preserves that mapped error type across hooks, helpers,
mutations, and `ensureData`:

```ts
class ApplicationApiError extends Error {
  constructor(readonly status: number, options: ErrorOptions) {
    super(`API request failed (${status})`, options);
  }
}

const tq = createTreatyQuery<App, ApplicationApiError>({
  mapError(error) {
    return new ApplicationApiError(error.status, { cause: error });
  },
});
```

`mapError` must return an `Error`. If it throws or returns another value,
Treaty Query throws `TreatyQueryErrorMappingError`, which retains both the
original `TreatyQueryError` and the mapper failure.

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

## Custom React hook keys

React hooks use Treaty Query's generated key by default. Supply TanStack's
ordinary `queryKey` or `mutationKey` option when an application needs to join
an existing custom key convention:

```tsx
const product = tq.products.$id.get.useQuery(
  { params: { id } },
  { queryKey: ["application-cache", "product", id] },
);

const updateProduct = tq.products.$id.patch.useMutation({
  params: { id },
  mutationKey: ["application-mutations", "product", id],
});
```

These options replace the complete generated key for that hook; they do not
extend it. The route, parameters, input, transport, and inferred result types
still work normally, but `tq.useUtils()` and `removeCacheScope()` operate on
canonical Treaty Query keys and therefore do not match a custom query key.
Include every value that can change the response, including a safe non-secret
session identity when hidden server context matters. Never place tokens,
cookies, authorization headers, or other secrets in a custom key.

Key overrides are intentionally hook-only. `createHelpers().queryOptions()`
and `.mutationOptions()` continue to return canonical keys for loaders,
prefetching, cache utilities, and SSR. Prefer the generated keys unless the
application is deliberately taking ownership of cache-key coordination.

## Optional cache scopes

Use a cache scope only when a GET response depends on hidden server context,
such as the authenticated session stored in an HTTP-only cookie. It is not a
mandatory user or tenant feature. Public endpoints, and routes whose path or
semantic input already contains the relevant identifier, should remain
unscoped so their cached data stays shareable.

```tsx
<tq.Provider client={api}>
  <PublicApp />

  <tq.CacheScope value={["user", session.user.id]}>
    <AuthenticatedApp />
  </tq.CacheScope>
</tq.Provider>
```

Nested `CacheScope` components use the nearest value. A query can override that
value, or opt out of an inherited scope:

```tsx
const access = tq.account.access.get.useQuery(undefined, {
  cacheScope: ["user", session.user.id],
});

const countries = tq.countries.get.useQuery(undefined, {
  cacheScope: false,
});
```

The precedence is the per-query `cacheScope`, then the nearest React
`CacheScope`, then no scope. Outside React, bind a default to helpers:

```ts
const helpers = tq.createHelpers({
  client: api,
  cacheScope: ["user", userId],
});
```

A scope is a string, finite number, or non-empty readonly serializable tuple.
Use a tuple when a structured identity is useful; plain objects are supported
inside tuples, but not as the top-level scope:

```ts
const scope = ["tenant-user", { tenantId, userId }] as const;
```

Scoped queries add an immutable marker before the route while retaining all
ordinary route parameters and semantic query input:

```ts
[
  "treaty-query",
  {
    kind: "treaty-query-scope",
    value: ["user", userId],
  },
  ["account", "access"],
  { kind: "query", method: "GET" },
]
```

Scope and application-prefix metadata use frozen tagged objects, while route
paths use arrays. The structurally distinct shapes prevent real routes such as
`/scope/admin` from being mistaken for scope metadata during TanStack's prefix
matching.

After logout or an account switch, remove the previous scope once components
using it have unmounted or switched values:

```tsx
function SessionCacheCleanup() {
  const utils = tq.useUtils();

  function removePreviousUser(previousUserId: string) {
    utils.removeCacheScope(["user", previousUserId]);
  }

  return null;
}
```

Removal matches the complete scope and this instance's configured key prefix.
It leaves public queries, other scopes, mutation entries, differently prefixed
Treaty Query instances, and unrelated TanStack queries untouched.

Never use authentication tokens, cookies, authorization headers, passwords,
or other secrets as a cache scope. If a visible route parameter or query input
already separates the data, keep the query outside `CacheScope` or use
`cacheScope: false`; the library does not guess whether identifiers are
duplicated.

## Typed cache utilities

`tq.useUtils()` returns a route-aware proxy bound to the nearest Treaty client,
cache scope, and TanStack `QueryClient`:

```tsx
const utils = tq.useUtils();

await utils.products.invalidate();
await utils.products({ id: productId }).get.invalidate();

const cached = utils.products({ id: productId }).get.getData();

utils.products({ id: productId }).get.setData((previous) =>
  previous === undefined
    ? previous
    : { ...previous, name: "Updated" },
);

const product = await utils.products({ id: productId }).get.ensureData();
```

Route-level `invalidate()` matches that route and its descendants. GET-level
`invalidate()` matches every semantic input for that endpoint. Both preserve
the inherited scope, so invalidating one user's products cannot invalidate
another user's entries. Pass `cacheScope: false` or another scope value to
override inheritance:

```ts
await utils.countries.invalidate({ cacheScope: false });
```

`getData`, `setData`, and `ensureData` address an exact GET key. Required query
input remains required and typed:

```ts
const coffee = utils.search.get.getData({
  query: { term: "coffee" },
});

utils.search.get.setData(
  { query: { term: "coffee" } },
  { term: "cached coffee" },
);
```

For an input-free GET, `setData(updater)` is the concise form. Supply
`undefined` explicitly when that operation also needs scope or `updatedAt`
options: `setData(undefined, updater, options)`.

`ensureData` executes the same Treaty request function as `useQuery` when the
exact entry is missing or stale. It accepts query/request options in its second
argument. `queryKey()` is also available on routes and GET operations for code
that needs the canonical prefix or exact key:

```ts
const productsPrefix = utils.products.queryKey();
const productKey = utils.products({ id: productId }).get.queryKey();
```

These utilities must be called from a React component or custom hook beneath
both this `tq.Provider` and TanStack's `QueryClientProvider`.

## Router loaders and SSR

Use `createHelpers()` outside React. The returned option factories work with
TanStack Router loaders and ordinary framework loaders without reading React
context:

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

Create both the Treaty client and `QueryClient` for each server request. Never
put either one in a server module-global singleton:

```ts
async function prepareRequest(request: Request, session: Session) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000 },
    },
  });

  // Application-defined: bind the official Treaty client to this request's
  // normal server transport without exposing credentials in query keys.
  const api = createRequestTreatyClient(request);
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

  return dehydrate(queryClient);
}
```

Hydrate that state into the render/client-side QueryClient using TanStack's
`HydrationBoundary` or `hydrate()`. Recreate helpers with the same application
prefix, route values, semantic input, and non-secret cache scope; the generated
keys are stable across the server/client boundary.

```tsx
<QueryClientProvider client={queryClient}>
  <HydrationBoundary state={dehydratedState}>
    <tq.Provider client={api}>
      <Application />
    </tq.Provider>
  </HydrationBoundary>
</QueryClientProvider>
```

A cache scope prevents the current scope from reading another scope's key, but
it is not an authorization or transport boundary. Never reuse a server
QueryClient between requests, send one user's dehydrated state to another
user, persist session-scoped state after logout, or place tokens, cookies, or
credentials in keys. Use your framework's safe serialization mechanism when
embedding dehydrated state in HTML; raw `JSON.stringify()` does not provide
HTML/XSS escaping.

See TanStack's official [Router React Query example](https://tanstack.com/router/latest/docs/framework/react/examples/basic-react-query),
[hydration reference](https://tanstack.com/query/latest/docs/framework/react/reference/hydration),
and [SSR guide](https://tanstack.com/query/latest/docs/framework/react/guides/ssr)
for framework integration details.

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

Dynamic parameters are fixed in the hook options. Mutation variables remain
the inferred Treaty body directly; query parameters, headers, and fetch
settings are also static for that mutation observer:

```tsx
const updateProduct = tq.products.$id.patch.useMutation({
  params: { id },
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
entries and do not receive cache scopes.

Mutation query parameters are intentionally fixed when the mutation observer
is created. Create another observer when those parameters need to change.

## Reserved route names

Most route names—including `get`, `post`, `queryOptions`, `useQuery`,
`constructor`, and `toString`—work through ordinary traversal. Use the exported
`routeSegment` symbol when a route collides with a root/helper member, utility
member, HTTP terminal, or Promise-like name:

```ts
import { routeSegment } from "treaty-query";

tq[routeSegment]("Provider").get.useQuery();
helpers[routeSegment]("then").get.queryOptions();
helpers[routeSegment]("get").get.queryOptions();
utils[routeSegment]("invalidate").get.queryKey();
```

Treaty Query proxies deliberately expose `.then`, `.catch`, and `.finally` as
undefined so `await`, `Promise.resolve`, and framework runtimes do not mistake
them for promises. The symbol escape is type-safe and is included in generated
keys as the original string segment. In React hook chains, properties beginning
with `$` are reserved for compiler-safe route-parameter markers. Use
`routeSegment` for a literal route name that begins with `$`.

## Compatibility and limitations

The first release exposes GET as a query and POST, PUT, PATCH, and DELETE as
mutations. HEAD, OPTIONS, CONNECT, and subscription routes are not exposed in
the typed adapter yet. Use the official Treaty client directly for those
methods.

See [the tested compatibility matrix](./docs/compatibility.md) for exact peer
versions. The declared peer ranges express intended semver compatibility; the
matrix distinguishes versions verified by the package-consumer tests.

## Development

Development uses [Bun](https://bun.sh/):

```sh
bun install
bun run check-types
bun test
bun run build
bun pm pack
bun run audit:package
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing changes.
Maintainers should follow [the release procedure](./docs/releasing.md); it
contains a hard stop before publication.

## AI-assisted usage and migration

The repository includes reusable coding-agent skills:

- [`$use-treaty-query`](https://github.com/mohd-riaz/treaty-query/tree/main/skills/use-treaty-query)
  sets up Treaty Query and implements typed React hooks, mutations, cache
  utilities, scopes, loaders, and SSR for new features.
- [`$migrate-eden-treaty`](https://github.com/mohd-riaz/treaty-query/tree/main/skills/migrate-eden-treaty)
  incrementally migrates an existing application from direct Eden Treaty calls.

Install either skill from the public repository:

```sh
npx skills add mohd-riaz/treaty-query --skill use-treaty-query
npx skills add mohd-riaz/treaty-query --skill migrate-eden-treaty
```

Keep each installed directory together so its reference guides remain
available. These skills are repository tooling and are not included in the
runtime npm package.

## License

MIT
