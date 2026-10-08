# Spotless Applier

Formats a file on save with the [Spotless](https://github.com/diffplug/spotless) configuration of its Gradle or Maven build.

It runs the real Spotless Gradle or Maven plugin on the unsaved buffer, so everything your build resolves applies: build scripts, parent POMs, `pluginManagement`, profiles, `.mvn/maven.config` and formatter settings shipped in plugin dependencies.

## Requirements

- Gradle builds: the [Gradle for Java](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-gradle) extension.
- Maven builds: [mvnd](https://github.com/apache/maven-mvnd) is recommended (about 0.3 s per save, against about 1 s with `mvn` or `mvnw`).

## Usage

Run it as a code action on save:

```json
"[java]": { "editor.codeActionsOnSave": { "source.fixAll.spotlessApplier": "explicit" } }
```

Or run **Spotless: Format Document** from the Command Palette.

## Settings

- `spotlessApplier.maven.executable`: the Maven executable. When empty, `mvnd` on the `PATH`, then `mvnw` in the build root, then `mvn` on the `PATH`.

## Known limitations

- Requires spotless-maven-plugin 2.40.0 or later and the Spotless Gradle plugin 8.7.0 or later. Older Maven plugins ignore the IDE hook and rewrite the module's files on disk; older Gradle plugins sometimes skip formatting.
- With `ratchetFrom`, the first save after a change is not formatted. With mvnd, later saves may not be formatted either; set `spotlessApplier.maven.executable` to `mvn` in that case.
- A file that more than one Spotless format targets is not formatted; a warning is logged.
- Steps that use npm, such as prettier, take several seconds.
- Maven: includes in a parent POM that reach into child module directories (for example `**/*.md` at the root) are not supported.
- Maven: a `pom.xml` that the topmost `pom.xml` in the workspace does not include as a module (for example a standalone sample project) is not formatted.
- Maven: mvnd on the `PATH` is used even when the build has `mvnw`. If the build needs the wrapper's Maven version, set `spotlessApplier.maven.executable`.
- In a build without Spotless, every save runs a build that fails. Enable the code action only in workspaces that use Spotless.
- On Windows, Maven builds fail when a path, including the user profile and the temp folder, contains a space.
- Does not run with `files.autoSave: afterDelay`, because VS Code runs no code actions on auto save.
- If mvnd keeps using a stale released parent POM, run `mvnd --stop`.
