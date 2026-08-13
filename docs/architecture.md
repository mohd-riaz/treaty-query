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

Phase 2 supports static, input-free GET option factories from
`tq.createHelpers({ client })`. Property access records route segments without
executing a request. TanStack starts the request through the generated
`queryFn`, whose signal is forwarded to the official Treaty method.

React bindings will use the same option factory rather than implementing a
second request path. Query input and dynamic route parameters will extend the
same key builder in later phases.

Cache scopes will be optional and used only when a response depends on hidden
server context. Public endpoints, and routes whose visible path or input already
contains the relevant discriminator, should remain unscoped.
