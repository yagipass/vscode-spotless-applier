import { spawnSync } from "node:child_process";
import console from "node:console";
import { readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const packagePath = path.join(root, "package.json");
const dependabotPath = path.join(root, ".github", "dependabot.yml");
const nodeIgnore =
  /(- dependency-name: "@types\/node"\n\s+versions: \[">=)(\d+)(\.0\.0"\])/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function fetchText(url) {
  const response = await globalThis.fetch(url);
  if (response.status === 404) {
    return undefined;
  }
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.text();
}

async function electronOf(vscode) {
  for (const tag of new Set([vscode, vscode.replace(/\.0$/, "")])) {
    const npmrc = await fetchText(
      `https://raw.githubusercontent.com/microsoft/vscode/${tag}/.npmrc`,
    );
    const target = npmrc && /^target="(.+)"$/m.exec(npmrc)?.[1];
    if (target) {
      return target;
    }
  }
  fail(`No Electron target found for VS Code ${vscode}.`);
}

async function nodeMajorOf(electron) {
  const deps = await fetchText(
    `https://raw.githubusercontent.com/electron/electron/v${electron}/DEPS`,
  );
  const major = deps && /'node_version':\s*'v(\d+)\./.exec(deps)?.[1];
  if (!major) {
    fail(`No node_version found for Electron ${electron}.`);
  }
  return Number(major);
}

const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
const minimum = /^\^(\d+\.\d+\.\d+)$/.exec(pkg.engines.vscode)?.[1];
if (!minimum) {
  fail(`engines.vscode must look like ^1.100.0, not ${pkg.engines.vscode}.`);
}
const electron = await electronOf(minimum);
const node = await nodeMajorOf(electron);
console.log(`VS Code ${minimum} runs Electron ${electron} with Node ${node}.`);

const typesNode = pkg.devDependencies["@types/node"];
const typesVscode = pkg.devDependencies["@types/vscode"];
const dependabot = readFileSync(dependabotPath, "utf8");
const ignoredFrom = nodeIgnore.exec(dependabot)?.[2];
if (!ignoredFrom) {
  fail(
    `.github/dependabot.yml must ignore @types/node with versions: [">=${node + 1}.0.0"].`,
  );
}

const problems = [];
if (Number(/^[\^~]?(\d+)\./.exec(typesNode)?.[1]) !== node) {
  problems.push(
    `@types/node is ${typesNode}, but VS Code ${minimum} runs Node ${node}.`,
  );
}
if (typesVscode !== minimum) {
  problems.push(
    `@types/vscode is ${typesVscode}, but engines.vscode starts at ${minimum}.`,
  );
}
if (Number(ignoredFrom) !== node + 1) {
  problems.push(
    `.github/dependabot.yml ignores @types/node >=${ignoredFrom}.0.0, but Node ${node} needs >=${node + 1}.0.0.`,
  );
}

if (problems.length === 0) {
  console.log("Runtime types match engines.vscode.");
  process.exit(0);
}
for (const problem of problems) {
  console.error(problem);
}
if (
  typesVscode !== minimum &&
  (await fetchText(`https://registry.npmjs.org/@types/vscode/${minimum}`)) ===
    undefined
) {
  fail(
    `@types/vscode ${minimum} is not published. Set engines.vscode to a version that has types.`,
  );
}
if (!process.argv.includes("--fix")) {
  fail("Run pnpm sync:runtime-types --fix.");
}

const add = spawnSync(
  "pnpm",
  ["add", "-D", `@types/node@^${node}`, `@types/vscode@${minimum}`],
  { cwd: root, stdio: "inherit" },
);
if (add.status !== 0) {
  fail("pnpm add failed.");
}
writeFileSync(
  dependabotPath,
  dependabot.replace(nodeIgnore, `$1${node + 1}$3`),
);
console.log("Synced runtime types with engines.vscode.");
