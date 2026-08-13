# Release checklist

- Confirm the changelog and package version.
- Run type checking, tests, and the production build.
- Pack the package and inspect the archive contents.
- Install the tarball into the package-consumer fixture and run its checks.
- Install the tarball into the lower-bound package-consumer fixture and run its
  checks.
- Run `bun run audit:package` and review any allowlist or license change.
- Confirm the compatibility matrix matches the exact successful fixtures.
- Run the performance sanity test on an otherwise idle machine.
- Confirm peer dependencies are external to generated JavaScript.
- Confirm no secrets, private paths, private research, or generated artifacts
  are present in the archive.
- Publish only from a clean, reviewed commit.
