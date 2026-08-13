# treaty-query

Type-safe TanStack Query bindings for Elysia Treaty clients.

> **Status:** early development. Static, input-free GET option factories and
> React `useQuery` hooks are implemented. Dynamic parameters, query input,
> mutations, and cache scopes are not implemented yet.

## React useQuery

Create one Treaty Query instance, provide an existing official Treaty client,
and keep TanStack's ordinary `QueryClientProvider`:

```tsx
import { treaty } from "@elysiajs/eden";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { App } from "./server";
import { createTreatyQuery } from "treaty-query";

const api = treaty<App>("https://api.example.com");
const queryClient = new QueryClient();
const tq = createTreatyQuery<App>();

export function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <tq.Provider client={api}>
        <Application />
      </tq.Provider>
    </QueryClientProvider>
  );
}
```

Static GET hooks infer their data and error types from the Treaty client:

```tsx
function Health() {
  const health = tq.health.get.useQuery(undefined, {
    staleTime: 30_000,
    select: (data) => data.ok,
  });

  return <span>{health.data ? "up" : "down"}</span>;
}
```

The first argument is currently `undefined` because semantic query input is a
later phase. TanStack options are the second argument, matching the future
input-bearing call shape. A hook must be rendered under the `Provider` from the
same `createTreatyQuery()` instance. Nested providers use the nearest client.

## Static GET query options

Bind an existing official Treaty client, then create ordinary TanStack Query
options:

```ts
import { treaty } from "@elysiajs/eden";
import { QueryClient } from "@tanstack/react-query";
import type { App } from "./server";
import { createTreatyQuery } from "treaty-query";

const api = treaty<App>("https://api.example.com");
const queryClient = new QueryClient();

const helpers = tq.createHelpers({ client: api });

const healthOptions = helpers.health.get.queryOptions({
  staleTime: 30_000,
});

const health = await queryClient.fetchQuery(healthOptions);
```

Hooks and helpers share this exact option factory. Creating the options is
lazy. The request starts only when TanStack invokes the generated `queryFn`.
Successful Treaty data is unwrapped, the TanStack abort signal is forwarded,
and failed results throw `TreatyQueryError`.

Generated keys are namespaced and contain the static route and operation:

```ts
[
  "treaty-query",
  ["health"],
  { kind: "query", method: "GET" },
]
```

An optional application prefix can isolate multiple APIs:

```ts
const tq = createTreatyQuery<App>({
  keyPrefix: ["admin-api"],
});
```

Only JSON-serializable values belong in a key prefix. Never use tokens,
cookies, authorization headers, credentials, or other secrets.

## Planned cache scopes

Session-dependent queries will be able to opt into a cache scope, while public
queries remain unscoped and shareable. A cache scope is for hidden server
context—not a mandatory tenant feature—and must never contain secrets.

## Development

Development uses [Bun](https://bun.sh/):

```sh
bun install
bun run check-types
bun test
bun run build
bun pm pack
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) before proposing changes.

## License

MIT
