# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 - Unreleased

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
