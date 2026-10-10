import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";
import type { GradleBuild } from "./build";
import {
  type BuildRequest,
  type BuildResult,
  type HookFiles,
  hookProperties,
} from "./hook";

interface GradleOutput {
  getOutputBytes_asU8(): Uint8Array;
}

export interface GradleApi {
  runBuild(options: {
    projectFolder: string;
    args: readonly string[];
    input: string;
    onOutput: (output: GradleOutput) => void;
    showOutputColors: boolean;
    cancellationKey: string;
  }): Promise<void>;
  cancelRunBuild(options: { cancellationKey: string }): Promise<void>;
}

export async function gradleArgs(
  file: string,
  hookFiles: HookFiles,
  initScript: string,
): Promise<string[]> {
  const properties = hookProperties(await realpath(file), hookFiles);
  return [
    "spotlessApply",
    "--quiet",
    "--no-configuration-cache",
    "--init-script",
    initScript,
    ...properties.map((property) => `-P${property}`),
  ];
}

export async function runGradle(
  request: BuildRequest<GradleBuild>,
  api: GradleApi,
  initScript: string,
): Promise<BuildResult> {
  const args = await gradleArgs(request.file, request.hookFiles, initScript);
  request.signal.throwIfAborted();
  const cancellationKey = `spotlessForGradleAndMaven-${randomUUID()}`;
  const output: Uint8Array[] = [];
  const build = api.runBuild({
    projectFolder: request.build.root,
    args,
    input: "",
    onOutput: (chunk) => {
      output.push(chunk.getOutputBytes_asU8());
    },
    showOutputColors: false,
    cancellationKey,
  });
  const log = () => Buffer.concat(output).toString("utf8");
  try {
    await settleOrAbort(build, request.signal, () => {
      void api.cancelRunBuild({ cancellationKey });
    });
    return { exitCode: 0, log: log() };
  } catch (error) {
    request.signal.throwIfAborted();
    return { exitCode: 1, log: `${log()}\n${String(error)}` };
  }
}

function settleOrAbort(
  promise: Promise<void>,
  signal: AbortSignal,
  onAbort: () => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      onAbort();
      reject(signal.reason as Error);
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort);
    });
  });
}
