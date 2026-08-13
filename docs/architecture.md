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

Cache scopes will be optional and used only when a response depends on hidden
server context. Public endpoints, and routes whose visible path or input already
contains the relevant discriminator, should remain unscoped.
