import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  type Codec,
  type HookOutput,
  interpretHookOutput,
  runWithHookFiles,
} from "../../src/hook";

const shiftJisLike: Codec & { readonly calls: string[] } = {
  calls: [],
  encode(text, encoding) {
    this.calls.push(`encode:${encoding}`);
    return Promise.resolve(new TextEncoder().encode(text.toUpperCase()));
  },
  decode(content, encoding) {
    this.calls.push(`decode:${encoding}`);
    return Promise.resolve(new TextDecoder().decode(content).toLowerCase());
  },
};

describe("runWithHookFiles", () => {
  it("encodes the buffer and decodes the result with the document's encoding, so non-UTF-8 sources round-trip", async () => {
    shiftJisLike.calls.length = 0;
    const output = await runWithHookFiles(
      "class a {}",
      "shiftjis",
      shiftJisLike,
      async (files) => {
        expect(await readFile(files.stdin, "utf8")).toBe("CLASS A {}");
        await writeFile(files.stdout, "CLASS A {}\n");
        await writeFile(files.stderr, "IS DIRTY\n");
        return { exitCode: 0, log: "ran" };
      },
    );
    expect(output).toEqual({
      exitCode: 0,
      log: "ran",
      stdout: "class a {}\n",
      stderr: "IS DIRTY\n",
    });
    expect(shiftJisLike.calls).toEqual(["encode:shiftjis", "decode:shiftjis"]);
  });

  it("reads empty output when the build never wrote any, so a run that did not reach Spotless is not mistaken for a result", async () => {
    const output = await runWithHookFiles("x", "utf8", shiftJisLike, () =>
      Promise.resolve({ exitCode: 0, log: "" }),
    );
    expect(output.stdout).toBe("");
    expect(output.stderr).toBe("");
  });

  it("deletes the temporary files even when the build throws, so unsaved source does not pile up in the temp directory", async () => {
    let stdin = "";
    await expect(
      runWithHookFiles("secret", "utf8", shiftJisLike, (files) => {
        stdin = files.stdin;
        return Promise.reject(new Error("spawn mvn ENOENT"));
      }),
    ).rejects.toThrow("ENOENT");
    expect(stdin).not.toBe("");
    expect(existsSync(stdin)).toBe(false);
  });
});

const formatted = "class A {}\n";

function output(overrides: Partial<HookOutput>): HookOutput {
  return { exitCode: 0, stdout: "", stderr: "", log: "", ...overrides };
}

describe("interpretHookOutput", () => {
  it("uses stdout as the formatted text when Spotless reports IS DIRTY", () => {
    expect(
      interpretHookOutput(output({ stderr: "IS DIRTY\n", stdout: formatted })),
    ).toEqual({ kind: "dirty", formatted });
  });

  it("leaves the buffer alone when Spotless reports IS CLEAN", () => {
    expect(interpretHookOutput(output({ stderr: "IS CLEAN\n" }))).toEqual({
      kind: "clean",
    });
  });

  it("does not apply a result that did not converge, because it would change the file again on every save", () => {
    expect(
      interpretHookOutput(
        output({ stderr: "DID NOT CONVERGE\n", stdout: formatted }),
      ),
    ).toEqual({ kind: "didNotConverge" });
  });

  it("treats a successful run without a status line as a file Spotless does not cover, not as an error", () => {
    expect(interpretHookOutput(output({}))).toEqual({ kind: "notCovered" });
  });

  it("refuses to apply anything when two formats answered, because the second one formatted an empty input", () => {
    expect(
      interpretHookOutput(
        output({ stderr: "IS DIRTY\nIS CLEAN\n", stdout: `${formatted}\n` }),
      ),
    ).toEqual({ kind: "multipleFormats" });
  });

  it("never applies output from a failed build, so a syntax error cannot wipe the buffer", () => {
    expect(
      interpretHookOutput(
        output({ exitCode: 1, stderr: "IS DIRTY\n", stdout: "" }),
      ),
    ).toEqual({ kind: "failed" });
  });

  it("finds the status line among JVM warnings and Windows line endings", () => {
    const stderr = [
      "WARNING: A restricted method in java.lang.foreign.MemorySegment has been called",
      "  IS DIRTY  ",
      "WARNING: Use --enable-native-access=ALL-UNNAMED to avoid a warning",
      "",
    ].join("\r\n");
    expect(interpretHookOutput(output({ stderr, stdout: formatted }))).toEqual({
      kind: "dirty",
      formatted,
    });
  });

  it("does not mistake a warning that mentions a status for the status itself", () => {
    expect(
      interpretHookOutput(
        output({ stderr: "WARNING: file IS DIRTY in cache\nIS CLEAN\n" }),
      ),
    ).toEqual({ kind: "clean" });
  });
});
