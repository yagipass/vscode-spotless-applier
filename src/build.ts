import { existsSync } from "node:fs";
import * as path from "node:path";

export interface GradleBuild {
  readonly tool: "gradle";
  readonly root: string;
}

export interface MavenBuild {
  readonly tool: "maven";
  readonly root: string;
  readonly module: string;
}

export type Build = GradleBuild | MavenBuild;

const gradleSettings = ["settings.gradle", "settings.gradle.kts"];
const gradleMarkers = [...gradleSettings, "build.gradle", "build.gradle.kts"];

export function detectBuild(
  file: string,
  workspaceFolder: string,
): Build | undefined {
  const dirs = ancestors(file, workspaceFolder);
  for (const [index, dir] of dirs.entries()) {
    if (has(dir, gradleMarkers)) {
      const root = dirs.slice(index).find((d) => has(d, gradleSettings));
      return { tool: "gradle", root: root ?? dir };
    }
    if (has(dir, ["pom.xml"])) {
      const root = dirs.findLast((d) => has(d, ["pom.xml"]));
      return { tool: "maven", root: root ?? dir, module: dir };
    }
  }
  return undefined;
}

function has(dir: string, names: string[]): boolean {
  return names.some((name) => existsSync(path.join(dir, name)));
}

function ancestors(file: string, workspaceFolder: string): string[] {
  const depth = (dir: string) =>
    dir.split(path.sep).filter((segment) => segment !== "").length;
  const dirs: string[] = [];
  let dir = path.dirname(file);
  for (let level = depth(dir) - depth(workspaceFolder); level >= 0; level--) {
    dirs.push(dir);
    dir = path.dirname(dir);
  }
  return dirs;
}
