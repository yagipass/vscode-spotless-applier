import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GradleApi } from "../../src/gradle";
import { gradleArgs, runGradle } from "../../src/gradle";

let base: string;
let file: string;

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), "spotless-applier-gradle-"));
  file = path.join(base, "A.java");
  writeFileSync(file, "");
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

const files = { stdin: "/tmp/in", stdout: "/tmp/out", stderr: "/tmp/err" };

type RunOptions = Parameters<GradleApi["runBuild"]>[0];

function fakeGradle(runBuild: (options: RunOptions) => Promise<void>) {
  const cancelled: string[] = [];
  const runs: RunOptions[] = [];
  const api: GradleApi = {
    runBuild: (options) => {
      runs.push(options);
      return runBuild(options);
    },
    cancelRunBuild: ({ cancellationKey }) => {
      cancelled.push(cancellationKey);
      return Promise.resolve();
    },
  };
  return { api, runs, cancelled };
}

function request(signal = new AbortController().signal) {
  return {
    build: { tool: "gradle" as const, root: base },
    file,
    hookFiles: files,
    signal,
  };
}

describe("gradleArgs", () => {
  it("routes Spotless's input and output through files via the init script, so build script output never ends up in the source", async () => {
    const args = await gradleArgs(file, files, "/ext/spotless-applier.gradle");
    expect(args).toEqual(
      expect.arrayContaining([
        "--init-script",
        "/ext/spotless-applier.gradle",
        "-PspotlessApplier.stdin=/tmp/in",
        "-PspotlessApplier.stdout=/tmp/out",
        "-PspotlessApplier.stderr=/tmp/err",
        "-PspotlessIdeHookUseStdIn",
        "-PspotlessIdeHookUseStdOut",
      ]),
    );
  });

  it("passes the real path of the file, because Gradle compares it with its canonical project directory and a symlinked workspace would never match", async () => {
    mkdirSync(path.join(base, "real"));
    writeFileSync(path.join(base, "real", "B.java"), "");
    symlinkSync(path.join(base, "real"), path.join(base, "link"));
    const args = await gradleArgs(
      path.join(base, "link", "B.java"),
      files,
      "/init.gradle",
    );
    expect(args).toContain(
      `-PspotlessIdeHook=${realpathSync(path.join(base, "real", "B.java"))}`,
    );
  });
});

describe("runGradle", () => {
  it("sends no buffer text through Gradle's stdin, which would re-encode it with the daemon's charset", async () => {
    const { api, runs } = fakeGradle(() => Promise.resolve());
    await runGradle(request(), api, "/init.gradle");
    expect(runs.map((run) => run.input)).toEqual([""]);
  });

  it("reports a failed build with its output and error, so the log explains why nothing was formatted", async () => {
    const { api } = fakeGradle((options) => {
      options.onOutput({
        getOutputBytes_asU8: () =>
          new TextEncoder().encode("Task 'spotlessApply' not found"),
      });
      return Promise.reject(new Error("Build failed"));
    });
    const result = await runGradle(request(), api, "/init.gradle");
    expect(result.exitCode).toBe(1);
    expect(result.log).toContain("Task 'spotlessApply' not found");
    expect(result.log).toContain("Build failed");
  });

  it("settles as soon as the save is cancelled and cancels the build, even when the Gradle server never answers", async () => {
    const { api, runs, cancelled } = fakeGradle(
      () => new Promise<void>(() => undefined),
    );
    const controller = new AbortController();
    const running = runGradle(request(controller.signal), api, "/init.gradle");
    await expect.poll(() => runs.length).toBe(1);
    controller.abort();
    await expect(running).rejects.toThrow();
    expect(cancelled).toEqual([runs[0]?.cancellationKey]);
  });

  it("does not start a build for a save that was cancelled while the Gradle extension was activating", async () => {
    const { api, runs } = fakeGradle(() => Promise.resolve());
    const controller = new AbortController();
    controller.abort();
    await expect(
      runGradle(request(controller.signal), api, "/init.gradle"),
    ).rejects.toThrow();
    expect(runs).toEqual([]);
  });
});
