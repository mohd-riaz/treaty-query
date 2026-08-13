# treaty-query

Type-safe TanStack Query bindings for Elysia Treaty clients.

> **Status:** early development. Version `0.1.0` currently contains the verified
> package scaffold only; route proxies and request execution are not implemented.

## Intended API

```tsx
const tq = createTreatyQuery<App>();

<tq.Provider client={api}>
  <App />
</tq.Provider>;
```

Session-dependent queries will be able to opt into a cache scope, while public
queries remain unscoped and shareable. A cache scope is for hidden server
context—not a mandatory tenant feature—and must never contain tokens, cookies,
headers, or other secrets.

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
