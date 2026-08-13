# Architecture

The package will expose a typed route proxy backed by an Elysia Treaty client
and TanStack Query. React bindings, framework-neutral helpers, request
execution, query-key construction, and error mapping will be kept as separate
modules so their behavior can be tested independently.

Cache scopes will be optional and used only when a response depends on hidden
server context. Public endpoints, and routes whose visible path or input already
contains the relevant discriminator, should remain unscoped.

Phase 1 establishes only the package boundary. It deliberately contains no
route proxy and performs no network requests.
