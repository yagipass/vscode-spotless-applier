import * as assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { setTimeout } from "node:timers/promises";
import * as vscode from "vscode";

export function workspacePath(...segments: string[]): string {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(folder, "the test workspace is not open");
  return path.join(folder.uri.fsPath, ...segments);
}

export function sourceDir(project: string, ...module: string[]): string {
  return workspacePath(project, ...module, "src/main/java/com/example");
}

export function unformatted(className: string): string {
  return `package com.example;\npublic class ${className} {\nint  x  =  1;\n}\n`;
}

export function googleFormatted(className: string): string {
  return `package com.example;\n\npublic class ${className} {\n  int x = 1;\n}\n`;
}

export function placeholder(className: string): string {
  return `package com.example;\n\npublic class ${className} {}\n`;
}

const created: string[] = [];
const restored = new Map<string, Buffer>();

export async function createFile(
  file: string,
  content: string | Uint8Array,
): Promise<vscode.Uri> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
  created.push(file);
  return vscode.Uri.file(file);
}

export async function restoreAfterTest(file: string): Promise<vscode.Uri> {
  restored.set(file, await readFile(file));
  return vscode.Uri.file(file);
}

async function cleanUp(): Promise<void> {
  for (const document of vscode.workspace.textDocuments) {
    if (document.isDirty) {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand("workbench.action.files.revert");
    }
  }
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  for (const file of created.splice(0)) {
    await rm(file, { force: true });
  }
  for (const [file, content] of restored) {
    await writeFile(file, content);
  }
  restored.clear();
}

teardown(cleanUp);

export async function openWithUnsavedText(
  uri: vscode.Uri,
  text: string,
  encoding?: string,
): Promise<vscode.TextDocument> {
  const document = await vscode.workspace.openTextDocument(
    uri,
    encoding === undefined ? {} : { encoding },
  );
  const editor = await vscode.window.showTextDocument(document);
  const whole = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  assert.ok(
    await editor.edit((builder) => {
      builder.replace(whole, text);
    }),
  );
  assert.ok(document.isDirty, "the buffer must differ from the file on disk");
  return document;
}

export async function save(document: vscode.TextDocument): Promise<void> {
  assert.ok(await document.save(), `could not save ${document.fileName}`);
}

export function readDisk(uri: vscode.Uri): Promise<string> {
  return readFile(uri.fsPath, "utf8");
}

function spotlessLog(): string {
  const dir = process.env["SPOTLESS_APPLIER_TEST_LOGS"];
  assert.ok(dir, "SPOTLESS_APPLIER_TEST_LOGS is not set");
  const file = readdirSync(dir, { recursive: true, encoding: "utf8" }).find(
    (name) => name.endsWith("Spotless Applier.log"),
  );
  return file === undefined ? "" : readFileSync(path.join(dir, file), "utf8");
}

export async function expectLog(pattern: RegExp): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (pattern.test(spotlessLog())) {
      return;
    }
    await setTimeout(100);
  }
  assert.fail(`The log does not match ${String(pattern)}:\n${spotlessLog()}`);
}

export async function expectFormattedOnSave(
  dir: string,
  className: string,
  decorate: (text: string) => string = (text) => text,
): Promise<void> {
  const uri = await createFile(
    path.join(dir, `${className}.java`),
    placeholder(className),
  );
  const document = await openWithUnsavedText(
    uri,
    decorate(unformatted(className)),
  );
  await save(document);
  assert.equal(document.getText(), decorate(googleFormatted(className)));
  assert.equal(await readDisk(uri), decorate(googleFormatted(className)));
}

export function commonSuite(options: {
  readonly sourceDir: () => string;
  readonly buildFile: () => string;
  readonly uncoveredSuffix: string;
}): void {
  test("formats the unsaved buffer on save", () =>
    expectFormattedOnSave(options.sourceDir(), "TmpSave"));

  test("formats the buffer without touching the file on disk, so nothing is written before the user saves", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpCommand.java"),
      placeholder("TmpCommand"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpCommand"));
    await vscode.commands.executeCommand("spotlessApplier.formatDocument");
    assert.equal(document.getText(), googleFormatted("TmpCommand"));
    assert.ok(document.isDirty);
    assert.equal(await readDisk(uri), placeholder("TmpCommand"));
  });

  test("leaves already formatted code exactly as it is", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpClean.java"),
      placeholder("TmpClean"),
    );
    const document = await openWithUnsavedText(
      uri,
      googleFormatted("TmpClean"),
    );
    await save(document);
    assert.equal(document.getText(), googleFormatted("TmpClean"));
    await expectLog(/TmpClean\.java: clean/);
  });

  test("leaves a file that no Spotless format covers unchanged", async () => {
    const uri = await restoreAfterTest(options.buildFile());
    const original = await readDisk(uri);
    const edited = original + options.uncoveredSuffix;
    const document = await openWithUnsavedText(uri, edited);
    await save(document);
    assert.equal(document.getText(), edited);
    await expectLog(
      new RegExp(`${RegExp.escape(path.basename(uri.fsPath))}: notCovered`),
    );
  });

  test("does not run a build just to list code actions, so the lightbulb and the Source Action menu stay cheap", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpMenu.java"),
      placeholder("TmpMenu"),
    );
    const document = await openWithUnsavedText(uri, unformatted("TmpMenu"));
    const range = new vscode.Range(0, 0, 0, 0);
    const listed = async (kind?: string) =>
      (
        await vscode.commands.executeCommand<vscode.CodeAction[]>(
          "vscode.executeCodeActionProvider",
          uri,
          range,
          kind,
        )
      ).filter(
        (action) => action.kind?.value === "source.fixAll.spotlessApplier",
      );
    assert.equal((await listed()).length, 0);
    const menu = await listed("source");
    assert.equal(menu.length, 1);
    assert.equal(menu[0]?.edit, undefined);
    const later = await createFile(
      path.join(options.sourceDir(), "TmpAfterMenu.java"),
      placeholder("TmpAfterMenu"),
    );
    await save(
      await openWithUnsavedText(later, googleFormatted("TmpAfterMenu")),
    );
    await expectLog(/TmpAfterMenu\.java: clean/);
    assert.doesNotMatch(spotlessLog(), /TmpMenu\.java/);
    assert.equal(document.getText(), unformatted("TmpMenu"));
  });

  test("converts the line endings to the ones Spotless writes, so the saved file passes spotlessCheck", async () => {
    const crlf = (text: string) => text.replace(/\n/g, "\r\n");
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpCrlf.java"),
      crlf(placeholder("TmpCrlf")),
    );
    const document = await openWithUnsavedText(
      uri,
      crlf(unformatted("TmpCrlf")),
    );
    assert.equal(document.eol, vscode.EndOfLine.CRLF);
    await save(document);
    assert.equal(document.eol, vscode.EndOfLine.LF);
    assert.equal(await readDisk(uri), googleFormatted("TmpCrlf"));
  });

  test("does not format a file that two formats cover, and warns in the log", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "twoformats", "TmpTwoFormats.java"),
      placeholder("TmpTwoFormats"),
    );
    const document = await openWithUnsavedText(
      uri,
      unformatted("TmpTwoFormats"),
    );
    await save(document);
    assert.equal(document.getText(), unformatted("TmpTwoFormats"));
    await expectLog(
      /\[warning\].*TmpTwoFormats\.java is a target of more than one Spotless format/,
    );
  });

  test("keeps a buffer with a syntax error as it is and only logs the failure", async () => {
    const uri = await createFile(
      path.join(options.sourceDir(), "TmpBroken.java"),
      placeholder("TmpBroken"),
    );
    const broken =
      "package com.example;\npublic class TmpBroken {\nint x = ;\n";
    const document = await openWithUnsavedText(uri, broken);
    await save(document);
    assert.equal(document.getText(), broken);
    assert.equal(await readDisk(uri), broken);
    await expectLog(/Spotless failed for .*TmpBroken\.java/);
  });
}

export function shiftJisTest(sourceDir: () => string): void {
  test("round-trips Japanese text in a Shift_JIS file without mojibake", async () => {
    const encode = (text: string) =>
      vscode.workspace.encode(text, { encoding: "shiftjis" });
    const uri = await createFile(
      path.join(sourceDir(), "TmpSjis.java"),
      await encode(placeholder("TmpSjis")),
    );
    const dirty =
      "package com.example;\n\n// 日本語のコメント\npublic class TmpSjis {\nint  x  =  1;\n}\n";
    const formatted =
      "package com.example;\n\n// 日本語のコメント\npublic class TmpSjis {\n  int x = 1;\n}\n";
    const document = await openWithUnsavedText(uri, dirty, "shiftjis");
    await save(document);
    assert.equal(document.getText(), formatted);
    assert.deepEqual(
      await readFile(uri.fsPath),
      Buffer.from(await encode(formatted)),
    );
  });
}
