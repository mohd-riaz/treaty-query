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
