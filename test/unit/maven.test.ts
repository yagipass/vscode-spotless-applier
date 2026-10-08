import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findMavenExecutable, mavenArgs, runMaven } from "../../src/maven";

let base: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "spotless-applier-maven-"));
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

function executable(relative: string): string {
  const file = path.join(base, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
  return file;
}

const files = { stdin: "/tmp/in", stdout: "/tmp/out", stderr: "/tmp/err" };

describe("mavenArgs", () => {
  it("selects only the file's module with -pl, so a large reactor does not run Spotless in every module", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo/core/api" },
      "/repo/core/api/src/A.java",
      "/ext/spotless-applier-maven-extension.jar",
      files,
    );
    expect(args).toEqual([
      "-q",
      "-B",
      "-f",
      "/repo/pom.xml",
      "-pl",
      "core/api",
      "--define",
      "maven.ext.class.path=/ext/spotless-applier-maven-extension.jar",
      "--define",
      "spotlessApplier.stdin=/tmp/in",
      "--define",
      "spotlessApplier.stdout=/tmp/out",
      "--define",
      "spotlessApplier.stderr=/tmp/err",
      "--define",
      "spotlessIdeHook=/repo/core/api/src/A.java",
      "--define",
      "spotlessIdeHookUseStdIn",
      "--define",
      "spotlessIdeHookUseStdOut",
      "com.diffplug.spotless:spotless-maven-plugin:apply",
    ]);
  });

  it("builds only the root project with -N when the file belongs to the root module, so its modules are not run", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo" },
      "/repo/src/A.java",
      "/ext.jar",
      files,
    );
    expect(args.slice(4, 6)).toEqual(["-N", "--define"]);
    expect(args).not.toContain("-pl");
  });

  it("never passes properties with -D, which mvnd 1.0 swallows and then runs a plain spotless:apply that rewrites the file on disk", () => {
    const args = mavenArgs(
      { tool: "maven", root: "/repo", module: "/repo" },
      "/repo/src/A.java",
      "/ext.jar",
      files,
    );
    expect(args.filter((arg) => arg.startsWith("-D"))).toEqual([]);
  });
});

describe("findMavenExecutable", () => {
  it("uses the configured executable as is, so users can pick mvn when mvnd misbehaves", () => {
    executable("bin/mvnd");
    expect(
      findMavenExecutable(
        path.join(base, "root"),
        "/opt/maven/bin/mvn",
        path.join(base, "bin"),
      ),
    ).toBe("/opt/maven/bin/mvn");
  });

  it("prefers mvnd on the PATH because a resident daemon is several times faster", () => {
    const mvnd = executable("bin/mvnd");
    executable("bin/mvn");
    executable("root/mvnw");
    expect(
      findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin")),
    ).toBe(mvnd);
  });

  it("uses the build's own mvnw over a global mvn, so the project's pinned Maven version runs", () => {
    executable("bin/mvn");
    const mvnw = executable("root/mvnw");
    expect(
      findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin")),
    ).toBe(mvnw);
  });

  it("falls back to mvn on the PATH, so a plain Maven installation still works", () => {
    executable("other/tool");
    const mvn = executable("bin/mvn");
    const searchPath = [path.join(base, "other"), path.join(base, "bin")].join(
      path.delimiter,
    );
    expect(findMavenExecutable(path.join(base, "root"), "", searchPath)).toBe(
      mvn,
    );
  });

  it("ignores files that are not executable, so a stray file named mvnd does not break every save", () => {
    writeFileSync(path.join(base, "mvnd"), "");
    const mvn = executable("bin/mvn");
    const searchPath = [base, path.join(base, "bin")].join(path.delimiter);
    expect(findMavenExecutable(path.join(base, "root"), "", searchPath)).toBe(
      mvn,
    );
  });

  it("reports that nothing was found, so the caller can log why nothing ran", () => {
    expect(
      findMavenExecutable(path.join(base, "root"), "", path.join(base, "bin")),
    ).toBeUndefined();
  });
});

describe("runMaven", () => {
  it("refuses to run without the bundled extension jar, because Spotless would then read Maven's own stdin and mvnd would hang", async () => {
    await expect(
      runMaven(
        {
          build: { tool: "maven", root: base, module: base },
          file: path.join(base, "A.java"),
          hookFiles: files,
          signal: new AbortController().signal,
        },
        {
          extensionJar: path.join(base, "missing.jar"),
          configuredExecutable: executable("bin/mvn"),
        },
      ),
    ).rejects.toThrow("missing.jar does not exist");
  });
});
