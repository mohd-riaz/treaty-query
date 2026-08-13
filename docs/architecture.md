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

Static, input-free GET option factories are available from
`tq.createHelpers({ client })`. Property access records route segments without
executing a request. TanStack starts the request through the generated
`queryFn`, whose signal is forwarded to the official Treaty method.

Phase 3 adds one React context per `createTreatyQuery()` instance. `tq.Provider`
stores only the supplied official Treaty client, and nested providers naturally
override parents. `tq.health.get.useQuery()` reads that client, creates options
through the same factory used by external helpers, and passes them to TanStack's
native `useQuery`. There is no module-global client and no second request path.

Query input and dynamic route parameters will extend the same proxies and key
builder in later phases.

Cache scopes will be optional and used only when a response depends on hidden
server context. Public endpoints, and routes whose visible path or input already
contains the relevant discriminator, should remain unscoped.
