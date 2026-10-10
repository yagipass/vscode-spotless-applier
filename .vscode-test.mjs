import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";
import { defineConfig } from "@vscode/test-cli";

const root = import.meta.dirname;
const fixtures = path.join(root, "test", "integration", "fixtures");
const userDataDir = path.join(os.tmpdir(), "spotless-vscode-test");

const pathWithoutMvnd = (process.env.PATH ?? "")
  .split(path.delimiter)
  .filter((dir) => !existsSync(path.join(dir, "mvnd")))
  .join(path.delimiter);

function config(label, test, workspace, env = {}) {
  const logs = path.join(root, ".cache", "logs", label);
  return {
    label,
    version: "1.140.0",
    files: `out/test/integration/${test}.test.js`,
    workspaceFolder: path.join(fixtures, workspace),
    installExtensions: ["vscjava.vscode-gradle@3.18.0"],
    launchArgs: [
      "--user-data-dir",
      userDataDir,
      "--logsPath",
      logs,
      "--log",
      "yagipass.vscode-spotless-for-gradle-and-maven:debug",
    ],
    env: { SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_LOGS: logs, ...env },
    mocha: { ui: "tdd", timeout: 300000 },
  };
}

export default defineConfig([
  config("gradle", "gradle", "gradle"),
  config("maven-mvnd", "maven", "maven", {
    SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_MAVEN: "mvnd",
  }),
  config("maven-mvnw", "maven", "maven", {
    SPOTLESS_FOR_GRADLE_AND_MAVEN_TEST_MAVEN: "mvnw",
    PATH: pathWithoutMvnd,
  }),
]);
