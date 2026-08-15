---
name: migrate-eden-treaty
description: Migrate existing TypeScript or React applications from direct Elysia Eden Treaty calls to Treaty Query and TanStack Query. Use when auditing an Eden Treaty client, adding Treaty Query providers and typed hooks, converting reads or writes, adapting existing TanStack Query wrappers, migrating loaders or SSR, introducing cache scopes for hidden session context, handling React Compiler-safe dynamic routes, or verifying an incremental migration.
---

# Migrate Eden Treaty

Migrate incrementally while preserving the official Eden Treaty client and
transport. Do not change the Elysia server contract merely to fit the adapter.

Read [references/migration-patterns.md](references/migration-patterns.md)
before modifying client calls. Use only the sections relevant to the project.

## Inspect before editing

1. Read repository instructions and detect the package manager, workspace
   boundaries, TypeScript configuration, React version, and test commands.
2. Locate the exported Elysia app type, every `treaty(...)` client, React
   roots, `QueryClient` creation, loaders, SSR entry points, and authentication
   boundaries.
3. Search for direct Eden calls and existing TanStack wrappers. Prefer `rg` and
   include route calls split across lines.
4. Record a migration inventory with each call classified as:
   - React GET state;
   - React mutation;
   - loader, prefetch, or SSR query;
   - cache read, write, or invalidation;
   - imperative transport that should remain a direct Treaty call.
5. Run the existing type checks and relevant tests to establish a baseline.

Do not install packages or edit files outside the requested repository. Do not
remove an existing data layer until its consumers have migrated and passed.

## Choose the migration boundary

- Use chained Treaty Query hooks for React-owned server state.
- Use `createHelpers({ client })` with the existing `QueryClient` for loaders,
  prefetching, SSR, or gradual adoption through TanStack's static hooks.
- Use `tq.useUtils()` for typed cache operations inside React.
- Keep direct Treaty calls for unsupported HTTP methods, streaming,
  subscriptions, downloads, or truly imperative requests that do not benefit
  from server-state caching.
- Preserve the existing Treaty client configuration. Treaty Query consumes the
  client; it does not replace the transport.

Prefer one route family or feature slice at a time. Keep intermediate commits
type-safe and runnable.

## Establish the shared setup

1. Install `treaty-query` and compatible peer dependencies with the project's
   existing package manager.
2. Export one typed `tq = createTreatyQuery<App>()` instance from a client-side
   module. Import the server app only as a type when the framework permits it.
3. Keep the application's existing `QueryClientProvider` and place
   `<tq.Provider client={api}>` beneath it.
4. Preserve request-local Treaty clients and `QueryClient` instances during
   SSR. Never introduce a server module-global query client.

## Migrate calls

For each inventory item:

1. Convert the route using the matching pattern in the reference.
2. Keep route parameters and semantic query input in their normal typed
   positions so they remain part of the generated key.
3. Move headers and fetch configuration under `request`; never place transport
   data or secrets in semantic input or keys.
4. Adapt result handling. Direct Eden calls return structured `{ data, error }`
   results; Treaty Query unwraps successful data and throws normalized errors.
5. In React Compiler code, replace render-time dynamic route calls with inferred
   `$parameterName` properties. Keep Treaty's callable route syntax for helpers
   and utilities.
6. Preserve mutation bodies as the variables passed to `mutate` or
   `mutateAsync`.
7. Remove obsolete local loading, error, cancellation, and request-deduplication
   state only after the replacement behavior is verified.

## Protect cache isolation

- Add a cache scope only when a GET response depends on hidden server context,
  such as a session cookie. Do not make scope mandatory for public endpoints.
- Do not duplicate an identifier already present in the route or semantic
  query input.
- Use only safe, non-secret identities. Never use tokens, cookies,
  authorization headers, passwords, or credentials as cache scopes or keys.
- After account switching or logout, remove the previous scope after consumers
  have unmounted or switched identities.
- Treat custom hook `queryKey` and `mutationKey` values as an explicit opt-out
  from canonical Treaty Query keys. Custom query keys are not matched by typed
  utilities or scope removal and must encode every response-changing value.

## Verify each slice

1. Run the project's formatter, type checker, tests, and production build.
2. Exercise pending, success, HTTP-error, transport-error, and cancellation
   behavior where applicable.
3. Confirm route parameters, semantic query input, and optional scope separate
   cache entries as intended.
4. For session-dependent queries, prove two identities cannot share data. For
   public unscoped queries, prove equivalent requests can share data.
5. If React Compiler is configured, compile dynamic query and mutation hooks
   and confirm the `$parameterName` form is accepted.
6. For SSR, verify request-local isolation and identical server/browser keys
   across dehydration and hydration.
7. Search again for direct Treaty calls and report which intentionally remain.

## Report the migration

Summarize changed files, migrated route families, intentionally retained direct
calls, cache-scope decisions, result/error behavior changes, tests run, and any
follow-up work. Call out custom keys and persisted-cache migration risks
explicitly.
