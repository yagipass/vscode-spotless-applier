import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import type { Build } from "./build";

export interface HookFiles {
  readonly stdin: string;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Codec {
  encode(text: string, encoding: string): PromiseLike<Uint8Array>;
  decode(content: Uint8Array, encoding: string): PromiseLike<string>;
}

export interface BuildRequest<B extends Build> {
  readonly build: B;
  readonly file: string;
  readonly hookFiles: HookFiles;
  readonly signal: AbortSignal;
}

export interface BuildResult {
  readonly exitCode: number;
  readonly log: string;
}

export function hookProperties(source: string, hookFiles: HookFiles): string[] {
  return [
    `spotlessApplier.stdin=${hookFiles.stdin}`,
    `spotlessApplier.stdout=${hookFiles.stdout}`,
    `spotlessApplier.stderr=${hookFiles.stderr}`,
    `spotlessIdeHook=${source}`,
    "spotlessIdeHookUseStdIn",
    "spotlessIdeHookUseStdOut",
  ];
}

export async function runWithHookFiles(
  text: string,
  encoding: string,
  codec: Codec,
  run: (hookFiles: HookFiles) => Promise<BuildResult>,
): Promise<HookOutput> {
  const dir = await mkdtemp(path.join(tmpdir(), "spotless-applier-"));
  try {
    const hookFiles: HookFiles = {
      stdin: path.join(dir, "stdin"),
      stdout: path.join(dir, "stdout"),
      stderr: path.join(dir, "stderr"),
    };
    await writeFile(hookFiles.stdin, await codec.encode(text, encoding));
    await writeFile(hookFiles.stdout, "");
    await writeFile(hookFiles.stderr, "");
    const result = await run(hookFiles);
    return {
      ...result,
      stdout: await codec.decode(await readFile(hookFiles.stdout), encoding),
      stderr: await readFile(hookFiles.stderr, "utf8"),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export interface HookOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly log: string;
}

export type HookResult =
  | { readonly kind: "dirty"; readonly formatted: string }
  | { readonly kind: "clean" }
  | { readonly kind: "didNotConverge" }
  | { readonly kind: "notCovered" }
  | { readonly kind: "multipleFormats" }
  | { readonly kind: "failed" };

const statusLines = new Set(["IS DIRTY", "IS CLEAN", "DID NOT CONVERGE"]);

export function interpretHookOutput(output: HookOutput): HookResult {
  if (output.exitCode !== 0) {
    return { kind: "failed" };
  }
  const statuses = output.stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => statusLines.has(line));
  if (statuses.length > 1) {
    return { kind: "multipleFormats" };
  }
  switch (statuses[0]) {
    case "IS DIRTY":
      return { kind: "dirty", formatted: output.stdout };
    case "IS CLEAN":
      return { kind: "clean" };
    case "DID NOT CONVERGE":
      return { kind: "didNotConverge" };
    default:
      return { kind: "notCovered" };
  }
}
