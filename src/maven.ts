import { spawn } from "node:child_process";
import { accessSync, constants, existsSync, statSync } from "node:fs";
import * as path from "node:path";
import type { MavenBuild } from "./build";
import {
  type BuildRequest,
  type BuildResult,
  type HookFiles,
  hookProperties,
} from "./hook";

export interface MavenOptions {
  readonly extensionJar: string;
  readonly configuredExecutable: string;
}

const windows = process.platform === "win32";

export function findMavenExecutable(
  root: string,
  configured: string,
  searchPath: string,
): string | undefined {
  if (configured !== "") {
    return configured;
  }
  const onPath = (name: string) =>
    searchPath
      .split(path.delimiter)
      .filter((dir) => dir !== "")
      .map((dir) => path.join(dir, executableName(name)))
      .find(isExecutable);
  const wrapper = path.join(root, executableName("mvnw"));
  return (
    onPath("mvnd") ??
    (isExecutable(wrapper) ? wrapper : undefined) ??
    onPath("mvn")
  );
}

export function mavenArgs(
  build: MavenBuild,
  file: string,
  extensionJar: string,
  hookFiles: HookFiles,
): string[] {
  const module = path.relative(build.root, build.module);
  const properties = [
    `maven.ext.class.path=${extensionJar}`,
    ...hookProperties(file, hookFiles),
  ];
  return [
    "-q",
    "-B",
    "-f",
    path.join(build.root, "pom.xml"),
    ...(module === "" ? ["-N"] : ["-pl", module]),
    ...properties.flatMap((property) => ["--define", property]),
    "com.diffplug.spotless:spotless-maven-plugin:apply",
  ];
}

export async function runMaven(
  request: BuildRequest<MavenBuild>,
  options: MavenOptions,
): Promise<BuildResult> {
  const { build } = request;
  if (!existsSync(options.extensionJar)) {
    throw new Error(`${options.extensionJar} does not exist`);
  }
  const executable = findMavenExecutable(
    build.root,
    options.configuredExecutable,
    process.env["PATH"] ?? "",
  );
  if (executable === undefined) {
    throw new Error(
      "No Maven executable found: install mvnd or mvn, add mvnw to the build root, or set spotlessApplier.maven.executable",
    );
  }
  const args = mavenArgs(
    build,
    request.file,
    options.extensionJar,
    request.hookFiles,
  );
  const result = await runProcess(executable, args, build.root, request.signal);
  return {
    exitCode: result.exitCode,
    log: [executable, ...args].join(" ") + "\n" + result.output,
  };
}

function runProcess(
  executable: string,
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<{ exitCode: number; output: string }> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: windows,
      windowsHide: true,
    });
    const interrupt = () => child.kill("SIGINT");
    signal.addEventListener("abort", interrupt, { once: true });
    const output: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => output.push(chunk));
    child.on("error", (error) => {
      signal.removeEventListener("abort", interrupt);
      reject(error);
    });
    child.on("close", (code) => {
      signal.removeEventListener("abort", interrupt);
      if (signal.aborted) {
        reject(signal.reason as Error);
        return;
      }
      resolve({
        exitCode: code ?? 1,
        output: Buffer.concat(output).toString("utf8"),
      });
    });
  });
}

function executableName(name: string): string {
  return windows ? `${name}.cmd` : name;
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK);
    return statSync(file).isFile();
  } catch {
    return false;
  }
}
