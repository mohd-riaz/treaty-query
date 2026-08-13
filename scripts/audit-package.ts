const archiveName = "treaty-query-0.1.0.tgz";
const archive = Bun.file(archiveName);

if (!(await archive.exists())) {
  throw new Error(`Missing ${archiveName}; run bun pm pack first.`);
}

const bundle = await Bun.file("dist/index.mjs").text();
for (const peer of ["@tanstack/react-query", "react"]) {
  if (!bundle.includes(`from \"${peer}\"`)) {
    throw new Error(`The runtime bundle no longer externalizes ${peer}.`);
  }
}

for (const bundledMarker of [
  "node_modules/@tanstack/react-query",
  "node_modules/@elysiajs/eden",
  "node_modules/elysia",
  "node_modules/react/",
]) {
  if (bundle.includes(bundledMarker)) {
    throw new Error(`The runtime bundle contains peer code: ${bundledMarker}`);
  }
}

if (bundle.length > 50_000) {
  throw new Error(`The runtime bundle unexpectedly grew to ${bundle.length} bytes.`);
}

const listing = Bun.spawnSync(["tar", "-tf", archiveName]);
if (listing.exitCode !== 0) {
  throw new Error(new TextDecoder().decode(listing.stderr));
}

const files = new TextDecoder()
  .decode(listing.stdout)
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((path) => path.replace(/^package\//u, ""));
const allowedFiles = new Set([
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/compatibility.md",
  "LICENSE",
  "README.md",
  "dist/index.d.mts",
  "dist/index.d.mts.map",
  "dist/index.mjs",
  "dist/index.mjs.map",
  "package.json",
]);

for (const file of files) {
  if (!allowedFiles.has(file)) {
    throw new Error(`Unexpected file in publish archive: ${file}`);
  }
}

for (const required of allowedFiles) {
  if (!files.includes(required)) {
    throw new Error(`Missing required publish file: ${required}`);
  }
}

const runtimePackages = [
  "@elysiajs/eden",
  "@tanstack/react-query",
  "elysia",
  "react",
] as const;

for (const dependency of runtimePackages) {
  const metadata = await Bun.file(`node_modules/${dependency}/package.json`).json();
  if (metadata.license !== "MIT") {
    throw new Error(
      `${dependency}@${metadata.version} has an unreviewed ${metadata.license} license.`,
    );
  }
}

console.log(
  `Audited ${files.length} publish files, ${bundle.length} runtime bytes, and ${runtimePackages.length} MIT-licensed peers.`,
);
