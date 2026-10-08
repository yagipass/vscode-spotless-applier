import * as esbuild from "esbuild";
import process from "node:process";

const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "warning",
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  await context.dispose();
}
