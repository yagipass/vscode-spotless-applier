import {
  type Build,
  detectBuild,
  type GradleBuild,
  type MavenBuild,
} from "./build";
import {
  type BuildRequest,
  type BuildResult,
  type Codec,
  type HookOutput,
  type HookResult,
  interpretHookOutput,
  runWithHookFiles,
} from "./hook";
import { minimalEdit, type TextReplacement } from "./minimalEdit";
import { SerialQueue } from "./serialQueue";

type Backend<B extends Build> = (
  request: BuildRequest<B>,
) => Promise<BuildResult>;

export interface Backends {
  readonly gradle: Backend<GradleBuild>;
  readonly maven: Backend<MavenBuild>;
}

export type LineEnding = "\n" | "\r\n";

export interface FormatTarget {
  readonly fileName: string;
  readonly version: number;
  readonly encoding: string;
  readonly eol: 1 | 2;
  getText(): string;
}

export interface FormatEdit {
  readonly replacement: TextReplacement | undefined;
  readonly lineEnding: LineEnding | undefined;
}

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export class SpotlessFormatter {
  private readonly queue = new SerialQueue();

  constructor(
    private readonly backends: Backends,
    private readonly codec: Codec,
    private readonly log: Logger,
    private readonly showStatus: (message: string) => void,
  ) {}

  async format(
    document: FormatTarget,
    workspaceFolder: string,
    signal: AbortSignal,
  ): Promise<FormatEdit | undefined> {
    const file = document.fileName;
    const build = detectBuild(file, workspaceFolder);
    if (build === undefined) {
      this.log.debug(`No Gradle or Maven build found for ${file}`);
      return undefined;
    }
    const version = document.version;
    const text = document.getText();
    const output = await this.run(build, file, text, document.encoding, signal);
    if (output === undefined) {
      return undefined;
    }
    const result = interpretHookOutput(output);
    this.report(file, result, output);
    if (result.kind !== "dirty") {
      return undefined;
    }
    if (document.version !== version) {
      this.log.info(
        `Discarded the Spotless result for ${file} because it changed while formatting`,
      );
      return undefined;
    }
    return toFormatEdit(
      text,
      document.eol === 2 ? "\r\n" : "\n",
      result.formatted,
    );
  }

  private async run(
    build: Build,
    file: string,
    text: string,
    encoding: string,
    signal: AbortSignal,
  ): Promise<HookOutput | undefined> {
    try {
      const output = await this.queue.run(build.root, signal, async () => {
        const started = Date.now();
        const output = await runWithHookFiles(
          text,
          encoding,
          this.codec,
          (hookFiles) =>
            build.tool === "gradle"
              ? this.backends.gradle({ build, file, hookFiles, signal })
              : this.backends.maven({ build, file, hookFiles, signal }),
        );
        this.log.debug(
          `Spotless (${build.tool}) ran in ${String(Date.now() - started)} ms for ${file}`,
        );
        return output;
      });
      signal.throwIfAborted();
      return output;
    } catch (error) {
      if (signal.aborted) {
        this.log.debug(`Cancelled Spotless for ${file}`);
      } else {
        this.log.error(`Could not run Spotless for ${file}: ${String(error)}`);
      }
      return undefined;
    }
  }

  private report(file: string, result: HookResult, output: HookOutput): void {
    switch (result.kind) {
      case "failed":
        this.log.error(
          `Spotless failed for ${file} (exit code ${String(output.exitCode)})\n${output.log}`,
        );
        return;
      case "multipleFormats":
        this.log.warn(
          `${file} is a target of more than one Spotless format; it was not formatted.`,
        );
        this.showStatus(
          "$(warning) Spotless: multiple formats match this file",
        );
        return;
      case "didNotConverge":
        this.log.warn(`Spotless did not converge for ${file}`);
        return;
      default:
        this.log.debug(`${file}: ${result.kind}\n${output.log}`);
    }
  }
}

function toFormatEdit(
  text: string,
  lineEnding: LineEnding,
  formatted: string,
): FormatEdit | undefined {
  const formattedLineEnding = formatted.includes("\r\n")
    ? "\r\n"
    : formatted.includes("\n")
      ? "\n"
      : lineEnding;
  const replacement = minimalEdit(
    text,
    formatted.replace(/\r?\n/g, lineEnding),
  );
  const changedLineEnding =
    formattedLineEnding === lineEnding ? undefined : formattedLineEnding;
  return replacement === undefined && changedLineEnding === undefined
    ? undefined
    : { replacement, lineEnding: changedLineEnding };
}
