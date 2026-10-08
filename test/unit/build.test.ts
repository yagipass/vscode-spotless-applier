import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { detectBuild } from "../../src/build";

let workspace: string;

function touch(...files: string[]): void {
  for (const file of files) {
    const absolute = path.join(workspace, file);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, "");
  }
}

function source(relative: string): string {
  return path.join(workspace, relative);
}

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "spotless-applier-build-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("detectBuild for Gradle", () => {
  it("runs from the settings directory, so subprojects get the configuration their root applies", () => {
    touch("settings.gradle", "build.gradle", "app/build.gradle.kts");
    expect(detectBuild(source("app/src/main/java/A.java"), workspace)).toEqual({
      tool: "gradle",
      root: workspace,
    });
  });

  it("uses the nearest settings file, so an included build nested in the workspace runs on its own", () => {
    touch("settings.gradle", "tools/plugin/settings.gradle.kts");
    expect(detectBuild(source("tools/plugin/src/A.java"), workspace)).toEqual({
      tool: "gradle",
      root: path.join(workspace, "tools/plugin"),
    });
  });

  it("falls back to the nearest build script when there is no settings file, so a project without settings.gradle is still formatted", () => {
    touch("lib/build.gradle");
    expect(detectBuild(source("lib/src/A.java"), workspace)).toEqual({
      tool: "gradle",
      root: path.join(workspace, "lib"),
    });
  });
});

describe("detectBuild for Maven", () => {
  it("runs the topmost pom as the reactor root and selects the nearest pom as the module, so parent configuration applies", () => {
    touch("pom.xml", "core/pom.xml", "core/api/pom.xml");
    expect(
      detectBuild(source("core/api/src/main/java/A.java"), workspace),
    ).toEqual({
      tool: "maven",
      root: workspace,
      module: path.join(workspace, "core/api"),
    });
  });

  it("uses the root itself as the module for a single-module build, so Maven runs only that project", () => {
    touch("pom.xml");
    expect(detectBuild(source("src/main/java/A.java"), workspace)).toEqual({
      tool: "maven",
      root: workspace,
      module: workspace,
    });
  });

  it("never uses a pom.xml above the workspace folder, so an unrelated build outside it is never run", () => {
    touch("pom.xml", "ws/src/A.java");
    const inner = path.join(workspace, "ws");
    expect(detectBuild(path.join(inner, "src/A.java"), inner)).toBeUndefined();
  });

  it("finds the build when the workspace folder was opened with different letter case, which VS Code treats as the same folder on macOS and Windows", () => {
    touch("pom.xml");
    const folderWithOtherCase = path.join(
      path.dirname(workspace),
      path.basename(workspace).toUpperCase(),
    );
    expect(
      detectBuild(source("src/main/java/A.java"), folderWithOtherCase),
    ).toEqual({ tool: "maven", root: workspace, module: workspace });
  });
});

describe("detectBuild with both or neither", () => {
  it("prefers a Maven module nested in a Gradle build, because the nearer build owns the file", () => {
    touch("settings.gradle", "legacy/pom.xml");
    expect(detectBuild(source("legacy/src/A.java"), workspace)).toEqual({
      tool: "maven",
      root: path.join(workspace, "legacy"),
      module: path.join(workspace, "legacy"),
    });
  });

  it("prefers a Gradle project nested in a Maven build, because the nearer build owns the file", () => {
    touch("pom.xml", "tool/build.gradle");
    expect(detectBuild(source("tool/src/A.java"), workspace)).toEqual({
      tool: "gradle",
      root: path.join(workspace, "tool"),
    });
  });

  it("does nothing for a file outside any build, so plain files never start a build", () => {
    touch("notes/readme.md");
    expect(detectBuild(source("notes/readme.md"), workspace)).toBeUndefined();
  });
});
