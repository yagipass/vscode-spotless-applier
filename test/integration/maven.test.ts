import * as assert from "node:assert/strict";
import * as path from "node:path";
import {
  commonSuite,
  createFile,
  expectFormattedOnSave,
  expectLog,
  openWithUnsavedText,
  placeholder,
  save,
  shiftJisTest,
  sourceDir,
  unformatted,
  workspacePath,
} from "./helpers";

const expectedExecutable = process.env["SPOTLESS_APPLIER_TEST_MAVEN"] ?? "";

suite(`Maven single module (${expectedExecutable})`, () => {
  commonSuite({
    sourceDir: () => sourceDir("single"),
    buildFile: () => workspacePath("single", "pom.xml"),
    uncoveredSuffix: "<!--   not a Spotless target   -->\n",
  });

  test(`runs ${expectedExecutable}, so both the daemon and a pinned Maven 3.10 wrapper are covered`, async () => {
    assert.ok(["mvnd", "mvnw"].includes(expectedExecutable));
    await expectFormattedOnSave(sourceDir("single"), "TmpExecutable");
    await expectLog(
      new RegExp(
        `TmpExecutable\\.java: dirty\\n\\S*${RegExp.escape(path.sep + expectedExecutable)} -q -B`,
      ),
    );
  });
});

suite(`Maven multi-module build (${expectedExecutable})`, () => {
  test("formats a module file with the plugin configured in the parent's pluginManagement, building only that module", async () => {
    await expectFormattedOnSave(sourceDir("multi", "app"), "TmpModule");
    await expectLog(/TmpModule\.java: dirty\n.* -pl app /);
  });
});

suite(
  `Maven configuration from a plugin dependency (${expectedExecutable})`,
  () => {
    test("applies the Eclipse formatter settings packaged in a jar on the plugin's classpath", async () => {
      const uri = await createFile(
        path.join(sourceDir("eclipse-config"), "TmpEclipse.java"),
        placeholder("TmpEclipse"),
      );
      const document = await openWithUnsavedText(
        uri,
        unformatted("TmpEclipse"),
      );
      await save(document);
      assert.equal(
        document.getText(),
        "package com.example;\npublic class TmpEclipse {\n       int x = 1;\n}\n",
      );
    });
  },
);

suite(`Maven Shift_JIS sources (${expectedExecutable})`, () => {
  shiftJisTest(() => sourceDir("sjis"));
});
