# Contributing

This project is in early development. Keep changes focused, typed, and covered
by tests.

## Development

Install Bun 1.3.14 or a compatible newer release, then run:

```sh
bun install
bun run check-types
bun test
bun run build
bun run audit:package
```

Before submitting a package-related change, also run `bun pm pack` and inspect
the archive. Do not commit generated `dist`, tarballs, dependency directories,
credentials, cookies, authorization headers, or application-specific data.

Use Conventional Commit-style subjects where practical, and explain API or
query-key changes in the pull request.
