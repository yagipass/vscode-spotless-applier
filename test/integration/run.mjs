import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "../..");
const cache = path.join(root, ".cache");
const fixtures = path.join(import.meta.dirname, "fixtures");
const env = {
  ...process.env,
  GRADLE_USER_HOME: path.join(cache, "gradle"),
  MAVEN_USER_HOME: path.join(cache, "maven-user-home"),
  MVND_DAEMON_STORAGE: path.join(cache, "mvnd"),
};

function run(command, args, cwd = root) {
  return spawnSync(command, args, { cwd, env, stdio: "inherit" }).status ?? 1;
}

function projects(tool, marker) {
  return readdirSync(path.join(fixtures, tool))
    .map((name) => path.join(fixtures, tool, name))
    .filter((dir) => existsSync(path.join(dir, marker)));
}

function mustRun(command, args, cwd = root) {
  if (run(command, args, cwd) !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}`);
  }
}

rmSync(path.join(cache, "logs"), { recursive: true, force: true });
for (const file of readdirSync(fixtures, {
  recursive: true,
  encoding: "utf8",
})) {
  if (/^Tmp.*\.java$/.test(path.basename(file))) {
    rmSync(path.join(fixtures, file));
  }
}

mustRun("mvn", [
  "-q",
  "-B",
  "-f",
  path.join(fixtures, "formatter-config", "pom.xml"),
  "install",
  `-Dmaven.repo.local=${path.join(cache, "m2")}`,
]);
for (const dir of projects("maven", "pom.xml")) {
  mustRun(
    "mvn",
    ["-q", "-B", "com.diffplug.spotless:spotless-maven-plugin:check"],
    dir,
  );
}
mustRun(
  "./mvnw",
  ["-q", "-B", "validate"],
  path.join(fixtures, "maven", "single"),
);
for (const dir of projects("gradle", "settings.gradle")) {
  mustRun("./gradlew", ["-q", "spotlessCheck"], dir);
}

const status = run("vscode-test", process.argv.slice(2));

run("mvnd", ["--stop"]);
run("./gradlew", ["--stop"], path.join(fixtures, "gradle", "single"));
process.exit(status);
