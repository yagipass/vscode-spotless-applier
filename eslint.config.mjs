import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

const noComments = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: { comment: "Comments are not allowed in source code." },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ loc: comment.loc, messageId: "comment" });
        }
      },
    };
  },
};

const shellImports = [
  {
    name: "node:child_process",
    importNames: ["exec", "execSync"],
    message: "Spawn without a shell.",
  },
  {
    name: "child_process",
    message: "Import node:child_process.",
  },
];

export default defineConfig(
  {
    ignores: [
      "dist/",
      "out/",
      ".vscode-test/",
      ".cache/",
      ".work/",
      "test/integration/fixtures/",
      "inject/maven/",
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    plugins: { local: { rules: { "no-comments": noComments } } },
    rules: {
      "local/no-comments": "error",
      "no-restricted-properties": [
        "error",
        {
          property: "onWillSaveTextDocument",
          message:
            "Its 1.5s budget is too short for a build and VS Code stops calling it after repeated overruns.",
        },
        {
          property: "registerDocumentFormattingEditProvider",
          message:
            "A second formatter per language silently disables the user's formatOnSave.",
        },
        {
          property: "registerDocumentRangeFormattingEditProvider",
          message:
            "A second formatter per language silently disables the user's formatOnSave.",
        },
        {
          property: "showErrorMessage",
          message:
            "Formatting fails often while editing; log it instead of notifying.",
        },
        {
          property: "showWarningMessage",
          message:
            "Formatting fails often while editing; log it instead of notifying.",
        },
      ],
      "no-restricted-imports": ["error", { paths: shellImports }],
    },
  },
  {
    files: ["test/unit/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vscode",
              message: "Unit tests must not depend on VS Code.",
            },
            ...shellImports,
            {
              name: "node:child_process",
              message: "Unit tests must not start external processes.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
