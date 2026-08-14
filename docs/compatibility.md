# Compatibility

The automated package-consumer fixtures install the packed tarball and use only
its public export. The following combinations are verified for `0.2.0`:

| Fixture               | Elysia | Eden Treaty | TanStack React Query | React  |
| --------------------- | ------ | ----------- | -------------------- | ------ |
| Declared lower bounds | 1.4.19 | 1.4.9       | 5.101.4              | 18.2.0 |
| Project baseline      | 1.4.29 | 1.4.9       | 5.101.4              | 19.2.8 |

Both fixtures type-check compiled declarations and execute GET queries,
dynamic paths, and mutations from the packed package. The lower-bound fixture
also executes an escaped `/then` route; the baseline fixture covers cache
scopes and dehydration/hydration.

The package declares these peer ranges:

```json
{
  "@elysiajs/eden": "^1.4.9",
  "@tanstack/react-query": "^5.101.4",
  "elysia": ">=1.4.19 <2",
  "react": "^18.0.0 || ^19.0.0"
}
```

Versions inside those ranges but absent from the table are expected to be
semver-compatible, but are not individually claimed as tested. Elysia and Eden
should be kept on mutually compatible releases because their generated route
types are tightly coupled.

The package's strict checks use `skipLibCheck: true`. This avoids known errors
inside Elysia's published declarations while keeping Treaty Query's own source,
tests, and emitted declarations strictly checked.

## React Compiler

Current source tests compile static query and mutation chains plus dynamic
`$parameterName` chains with `babel-plugin-react-compiler` 1.0.0 and Babel
7.29.0. The plugin is a development-only test dependency, not a runtime peer.

The legacy hook form with a render-time route call, such as
`tq.products({ id }).patch.useMutation()`, remains runtime compatible. React
Compiler rejects that form because it cannot prove the dynamically obtained
hook function is the same on every render. Use
`tq.products.$id.patch.useMutation({ params: { id } })` in compiled React
components. Helpers and cache utilities continue to use Treaty's natural
callable route syntax.
