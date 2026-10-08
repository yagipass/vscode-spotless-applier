import {
  commonSuite,
  expectFormattedOnSave,
  shiftJisTest,
  sourceDir,
  workspacePath,
} from "./helpers";

suite("Gradle single project", () => {
  commonSuite({
    sourceDir: () => sourceDir("single"),
    buildFile: () => workspacePath("single", "build.gradle"),
    uncoveredSuffix: "\n//   not a Spotless target   \n",
  });
});

suite("Gradle multi-project build", () => {
  test("formats a subproject file with the configuration the subproject applies, keeping non-ASCII text intact even when the daemon's file.encoding is not UTF-8", () =>
    expectFormattedOnSave(sourceDir("multi", "app"), "TmpApp", (text) =>
      text.replace("\npublic", "\n// 日本語のコメント\npublic"),
    ));
});

suite("Gradle Shift_JIS sources", () => {
  shiftJisTest(() => sourceDir("sjis"));
});
