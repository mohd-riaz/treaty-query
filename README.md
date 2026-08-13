# treaty-query

Type-safe TanStack Query bindings for Elysia Treaty clients.

> **Status:** early development. Static, input-free GET option factories are
> implemented. React hooks, dynamic parameters, query input, mutations, and
> cache scopes are not implemented yet.

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

const tq = createTreatyQuery<App>();
const helpers = tq.createHelpers({ client: api });

const healthOptions = helpers.health.get.queryOptions({
  staleTime: 30_000,
});

const health = await queryClient.fetchQuery(healthOptions);
```

Creating the options is lazy. The request starts only when TanStack invokes the
generated `queryFn`. Successful Treaty data is unwrapped, the TanStack abort
signal is forwarded, and failed results throw `TreatyQueryError`.

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
