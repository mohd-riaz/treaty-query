# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added React Compiler-compatible `$parameterName` route markers for dynamic
  query and mutation hooks while preserving the chained tRPC-style API.
- Added hook-level `queryKey` and `mutationKey` overrides for applications that
  deliberately manage their own TanStack cache-key convention.
- Added regression tests that compile static and dynamic hook chains with the
  official React Compiler Babel plugin.

### Changed

- Cached hook-proxy property results so compiler-safe route chains expose
  stable terminal hook function identities.
- Changed cache-scope and application-prefix markers from arrays to frozen
  tagged objects so metadata is structurally distinct from route paths. This
  changes persisted scoped and prefixed key shapes; those caches will be cold
  after upgrading.
- Kept the legacy callable route syntax for helpers, utilities, and runtime
  compatibility; compiled React components should use `$parameterName`
  markers for dynamic routes.

### Fixed

- Prevented literal routes such as `/scope/admin` from being invalidated or
  removed when their path happened to equal cache-scope metadata.

## 0.1.1 - 2026-08-14

### Changed

- Corrected the npm-facing release status.
- Added installation commands for npm, pnpm, Yarn, and Bun.
- Clarified the tRPC-style developer-experience positioning without implying
  runtime compatibility or affiliation.
- Improved package description and keywords for discovery.

## 0.1.0 - 2026-08-14

### Added

- Initial ESM package scaffold.
- Type declarations, source maps, tests, and package-consumer fixture.
- Bound `createHelpers({ client })` factory for static, input-free GET routes.
- Namespaced, immutable GET query keys with optional application prefixes.
- Lazy Treaty execution with TanStack abort-signal forwarding.
- `TreatyQueryError` conversion for HTTP and transport failures.
- Successful Treaty data unwrapping and `undefined`-to-`null` normalization.
- Instance-local React `Provider` and static GET `useQuery` hooks.
- Shared hook/helper execution and query-key behavior.
- Nested-provider override and missing-provider diagnostics.
- Typed semantic GET query input for helpers and React hooks.
- Positional static and nested dynamic route-parameter calls.
- Query keys containing normalized path parameters and semantic input.
- Transport-only request headers and fetch options excluded from query keys.
- Typed POST, PUT, PATCH, and DELETE mutation hooks and option factories.
- Body-only mutation variables with static query and transport configuration.
- Namespaced mutation keys with positional dynamic parameters.
- Mutation success, callback, HTTP-error, and transport inference.
- Optional React and helper-bound cache scopes for hidden server context.
- Nested scope override, per-query override, and explicit inheritance disable.
- Serializable tuple scope validation and immutable scope snapshots.
- Exact previous-scope query removal isolated by namespace and API prefix.
- Typed route and GET key-prefix factories through `tq.useUtils()`.
- Scope-aware route and GET invalidation.
- Typed exact cache reads and writes with `getData` and `setData`.
- Network-backed `ensureData` using the shared Treaty query factory.
- Verified `createHelpers()` integration with real TanStack Router loaders.
- Verified request-local QueryClient isolation and dehydration/hydration key
  stability for public and scoped queries.
- Symbol-escaped reserved route segments without Promise assimilation.
- Optional typed global error mapping with mapper-failure preservation.
- Expanded HTTP error, empty-response, malformed-result, and performance tests.
- Packed-consumer verification at declared lower peer bounds and the project
  baseline.
- Automated bundle, publish-content, size, and runtime-peer license audits.
