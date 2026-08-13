# Releasing

This procedure prepares and publishes a `treaty-query` release. Publishing,
tagging, pushing, and creating a hosted release are external writes and require
explicit authorization from the repository owner.

## Candidate verification

From the public repository root, verify the intended version and begin from a
clean reviewed commit on `main`:

```sh
git status --short
git branch --show-current
git log -1 --oneline
bun install --frozen-lockfile
bun run check-types
bun test
bun run audit:package
```

`git status --short` must print nothing. Inspect the exact candidate archive:

```sh
tar -tf treaty-query-0.1.0.tgz
```

Then verify both isolated consumers against that archive:

```sh
cd tests/consumer
bun install --force
bun run check
cd ../consumer-lower
bun install --force
bun run check
cd ../..
```

Return to a clean tree, confirm npm authentication without printing or storing
a token, and execute Bun's non-publishing registry simulation:

```sh
git status --short
bun pm whoami
bun publish --dry-run
```

Stop here until publication is explicitly authorized.

## Authorized publication only

After explicit authorization, recheck the clean commit and publish exactly the
reviewed version:

```sh
git status --short
git log -1 --oneline
bun publish --access public
```

Only after the registry confirms `0.1.0`, create and push the matching tag:

```sh
git tag -a v0.1.0 -m "treaty-query v0.1.0"
git push origin main
git push origin v0.1.0
```

Do not pass authentication tokens, cookies, or long-lived credentials in shell
arguments. Use the package manager's configured authentication and interactive
one-time-password flow.
