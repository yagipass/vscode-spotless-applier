# Contributing

## Requirements

- Node.js 24 and pnpm
- JDK 21 and Maven (`mvn`)
- [mvnd](https://github.com/apache/maven-mvnd), for the integration tests only

With Nix, `nix develop` (or `direnv allow`) provides all of them.

## Build

```sh
pnpm install
pnpm build
```

`pnpm build` bundles the extension and builds the Maven extension in `inject/maven`, both into `dist/`. `pnpm watch` rebuilds the TypeScript on change.

To try it in VS Code, package and install it:

```sh
pnpm package
code --install-extension vscode-spotless-applier-*.vsix
```

## Checks

```sh
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
```

`pnpm test:integration` downloads VS Code and the Gradle for Java extension, then formats the projects in `test/integration/fixtures` with Gradle, mvnd and `mvnw`. Caches and VS Code logs go to `.cache/`.
