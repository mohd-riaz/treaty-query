# Architecture

The package exposes typed helpers backed by an existing official Elysia Treaty
client and TanStack Query installation. It does not create a transport or
`QueryClient`.

The implementation separates:

- recursive route-surface types and the runtime route proxy;
- immutable query-key construction;
- Treaty request execution and result normalization;
- public error conversion;
- framework-neutral option factories.

GET option factories are available from
`tq.createHelpers({ client })`. Property access records route segments without
executing a request. TanStack starts the request through the generated
`queryFn`, whose signal is forwarded to the official Treaty method.

Phase 3 adds one React context per `createTreatyQuery()` instance. `tq.Provider`
stores only the supplied official Treaty client, and nested providers naturally
override parents. `tq.health.get.useQuery()` reads that client, creates options
through the same factory used by external helpers, and passes them to TanStack's
native `useQuery`. There is no module-global client and no second request path.

Phase 4 replaces plain path strings with immutable route segments. Dynamic
calls append a parameter segment at their exact route position; request
execution replays those calls against the official Treaty client. Keys encode
sorted parameter entries and normalize numeric URL parameters to strings.

Semantic query input is passed to Treaty and stored as a plain value under the
operation's `input` key. Transport-only headers and fetch options live under
the caller's `request` option, are removed before passing options to TanStack,
and never enter the key. TanStack's abort signal always replaces a transport
signal.

Phase 5 adds mutation operations for POST, PUT, PATCH, and DELETE. The inferred
Treaty body is TanStack's variables value. The official Treaty method's second
argument is bound from `options.request`, so query parameters and transport
configuration remain fixed for one mutation observer and never become part of
callback variables.

Mutation keys share the namespace, optional prefix, and positional route model.
They contain the HTTP method and static query parameters, but exclude bodies,
headers, and fetch configuration. Mutation execution uses the same structured
result normalizer and `TreatyQueryError` conversion as queries.

Phase 6 adds optional query cache scopes for responses that depend on hidden
server context. A separate React context carries the nearest scope without
changing the Treaty client provider. Bound helpers can carry the same default,
and a query-level value overrides either source; `false` explicitly disables
inheritance.

Scoped GET keys place an immutable `["scope", value]` marker after the optional
application prefix and before the route. Scope values are validated and
snapshotted as strings, finite numbers, or non-empty readonly serializable
tuples. Route parameters and semantic input keep their existing key positions.
Mutations remain unscoped.

`tq.useUtils().removeCacheScope(scope)` removes query-cache entries only when
the key has this library's namespace, this instance's exact optional prefix,
and the complete stable scope value. Public entries, other scopes, mutation
entries, differently prefixed instances, and unrelated TanStack queries are
not affected.

Phase 7 turns `useUtils()` into a typed route proxy while retaining the exact
root cleanup operation. Route and GET key factories call the same immutable
path, prefix, operation, and cache-scope builders used by query options.

Route invalidation uses a canonical key ending in the route-path array; an
empty or partial nested path therefore uses TanStack's normal partial-key
matching without crossing scope or application-prefix positions. GET
invalidation appends the base `{ kind: "query", method: "GET" }` operation and
therefore matches all semantic inputs for only that endpoint. Exact `getData`,
`setData`, and `ensureData` operations use the complete GET key.

The utility proxy is created inside `useUtils()` from the nearest client,
nearest cache scope, and existing TanStack `QueryClient`. It neither stores
runtime state globally nor creates another query client or request path.

Phase 8 validates the existing `createHelpers({ client, cacheScope? })`
boundary outside React. TanStack Router loaders pass its ordinary query option
objects to a QueryClient. SSR handlers create a Treaty client, helpers, and a
QueryClient per request, prefetch or ensure queries, then use TanStack's native
dehydration state without a Treaty Query-specific serialization format.

Server and browser helpers independently reproduce identical keys when given
the same prefix, scope, route parameters, and semantic input. Public and scoped
queries can coexist in one request-local dehydrated state. A state object is
never safe to reuse across requests merely because its keys are scoped: scope
isolates cache lookup, while request-local QueryClients and correct response
delivery provide the actual server isolation boundary.

Phase 9 adds a symbol-based raw route segment. Normal properties remain lazy,
while the escape records the original string distinctly so root `then`,
`catch`, and `finally` routes can use Eden's dynamic-segment call form without
making Treaty Query proxies thenable. The key builder serializes escaped and
ordinary route names identically.

The request normalizer handles all structured failures before applying an
optional application error mapper. A mapper failure becomes
`TreatyQueryErrorMappingError`, retaining the normalized Treaty error and the
mapper cause. Successful 204/205 and undefined bodies normalize to `null` so a
TanStack query function never resolves to undefined.

The production bundle externalizes all peers. CI installs the packed tarball
into both the project baseline and declared lower-bound consumer fixtures, and
the package audit enforces the publish allowlist, runtime size ceiling, peer
imports, and reviewed runtime-peer licenses.
