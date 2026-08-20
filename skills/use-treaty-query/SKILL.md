---
name: use-treaty-query
description: Set up and use Treaty Query in TypeScript, React, and Elysia applications. Use when installing or configuring Treaty Query, creating typed GET hooks or mutations, working with dynamic Treaty routes, using cache utilities, adding safe cache scopes for hidden session context, mapping errors, integrating loaders or SSR, supporting React Compiler, or reviewing new Treaty Query feature code.
---

# Use Treaty Query

Build typed server-state features on the official Eden Treaty client and the
application's existing TanStack Query cache. Do not alter the Elysia server
contract merely to fit Treaty Query.

Read [references/react-patterns.md](references/react-patterns.md) for React
setup, hooks, mutations, utilities, scopes, and errors. Read
[references/loaders-and-ssr.md](references/loaders-and-ssr.md) only when the
task involves loaders, prefetching, server rendering, or hydration.

## Inspect the application

1. Read repository instructions and detect the package manager, workspaces,
   TypeScript settings, React version, and test commands.
2. Locate the exported Elysia app type, official `treaty(...)` client,
   `QueryClient`, React root, authentication boundary, and server/client entry
   points.
3. Inspect the installed `treaty-query` version and its matching documentation.
   Do not assume APIs from another release.
4. Run existing type checks and relevant tests before editing when practical.

## Choose the correct surface

- Use `tq.<route>.get.useQuery()` for GET-backed React server state.
- Use `tq.<route>.<method>.useMutation()` for POST, PUT, PATCH, and DELETE in
  React.
- Use `tq.useUtils()` for typed invalidation, exact reads and writes,
  `ensureData()`, and canonical keys inside React.
- Use `tq.createHelpers({ client })` with TanStack's static hooks or outside
  React, including loaders, prefetching, tests, and SSR.
- Keep the official Treaty client for HEAD, OPTIONS, CONNECT, subscriptions,
  streaming, download/progress flows, and intentional one-shot requests that
  should not enter the Query cache.

## Implement one coherent feature

1. Reuse one module-level `createTreatyQuery<App>()` instance for the API.
2. Keep TanStack's existing `QueryClientProvider`; place `tq.Provider` beneath
   it and pass the official Treaty client.
3. Use inferred `$parameterName` properties plus `params` for dynamic hooks in
   React Compiler code. Use Treaty's callable parameter syntax for helpers and
   utilities.
4. Put response-defining query values in semantic input. Put headers and fetch
   configuration under `request`; they are deliberately excluded from keys.
5. Pass mutation bodies to `mutate` or `mutateAsync`. Keep route parameters and
   mutation query values fixed in the hook options.
6. Use generated keys unless the application deliberately owns coordination
   for a complete custom key convention.
7. Apply a cache scope only when hidden server context changes a GET response.
   Keep public and visibly identified data unscoped.
8. Update every reader, invalidation, optimistic update, and prefetch for the
   feature so they address the same canonical key.

## Preserve safety

- Never place tokens, cookies, authorization headers, credentials, passwords,
  or other secrets in inputs, route parameters, key prefixes, scopes, custom
  keys, logs, fixtures, or dehydrated state.
- Treat cache scopes as cache partitioning, not authorization.
- Never reuse a server `QueryClient`, request-bound Treaty client, router, or
  scoped helpers across HTTP requests.
- Do not conditionally call hooks. Use TanStack options such as `enabled` when
  execution must wait.
- Remember that Treaty Query unwraps successful `data` and rejects failures
  with `TreatyQueryError` or the configured mapped error.

## Verify the result

Run the repository's formatter, type checks, and relevant tests. Verify:

- route parameters, semantic query values, mutation bodies, and request-only
  transport values reach their intended positions;
- generated keys separate distinct inputs without including transport data;
- invalidation and optimistic updates match the feature's query keys;
- two hidden identities cannot read the same scoped cache entry while public
  queries remain shareable;
- dynamic hooks compile under React Compiler when the project uses it;
- server requests are isolated and hydration reuses matching client keys;
- HTTP, transport, cancellation, loading, and empty-result behavior is handled.

Report the files changed, feature behavior, checks run, and any direct Treaty
calls intentionally retained.
