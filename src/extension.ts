import * as vscode from "vscode";
import { SpotlessFormatter } from "./formatter";
import { type GradleApi, runGradle } from "./gradle";
import { runMaven } from "./maven";

const codeActionKind =
  vscode.CodeActionKind.SourceFixAll.append("spotlessApplier");
const gradleExtensionId = "vscjava.vscode-gradle";

class SpotlessCodeAction extends vscode.CodeAction {
  constructor(readonly document: vscode.TextDocument) {
    super("Format with Spotless", codeActionKind);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const log = vscode.window.createOutputChannel("Spotless Applier", {
    log: true,
  });
  const extensionJar = context.asAbsolutePath(
    "dist/spotless-applier-maven-extension.jar",
  );
  const initScript = context.asAbsolutePath("dist/spotless-applier.gradle");
  let missingGradleReported = false;
  const loadGradleApi = async (): Promise<GradleApi> => {
    const extension =
      vscode.extensions.getExtension<GradleApi>(gradleExtensionId);
    if (extension === undefined) {
      if (!missingGradleReported) {
        missingGradleReported = true;
        void vscode.window.showInformationMessage(
          `Spotless Applier needs the "Gradle for Java" extension (${gradleExtensionId}) to format files in Gradle builds.`,
        );
      }
      throw new Error(`${gradleExtensionId} is not installed`);
    }
    return extension.activate();
  };
  const formatter = new SpotlessFormatter(
    {
      gradle: async (request) =>
        runGradle(request, await loadGradleApi(), initScript),
      maven: (request) =>
        runMaven(request, {
          extensionJar,
          configuredExecutable: vscode.workspace
            .getConfiguration("spotlessApplier")
            .get("maven.executable", ""),
        }),
    },
    {
      encode: (text, encoding) => vscode.workspace.encode(text, { encoding }),
      decode: (content, encoding) =>
        vscode.workspace.decode(content, { encoding }),
    },
    log,
    (message) => vscode.window.setStatusBarMessage(message, 5000),
  );

  const computeEdit = async (
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.WorkspaceEdit | undefined> => {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (document.uri.scheme !== "file" || folder === undefined) {
      return undefined;
    }
    const edit = await formatter.format(
      document,
      folder.uri.fsPath,
      toAbortSignal(token),
    );
    if (edit === undefined) {
      return undefined;
    }
    const edits: vscode.TextEdit[] = [];
    if (edit.replacement !== undefined) {
      const range = new vscode.Range(
        document.positionAt(edit.replacement.start),
        document.positionAt(edit.replacement.end),
      );
      edits.push(vscode.TextEdit.replace(range, edit.replacement.text));
    }
    if (edit.lineEnding !== undefined) {
      edits.push(
        vscode.TextEdit.setEndOfLine(
          edit.lineEnding === "\r\n"
            ? vscode.EndOfLine.CRLF
            : vscode.EndOfLine.LF,
        ),
      );
    }
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.set(document.uri, edits);
    return workspaceEdit;
  };

  const codeActionProvider: vscode.CodeActionProvider<SpotlessCodeAction> = {
    provideCodeActions(document, _range, codeActionContext) {
      return codeActionContext.only?.contains(codeActionKind)
        ? [new SpotlessCodeAction(document)]
        : [];
    },
    async resolveCodeAction(action, token) {
      action.edit = await computeEdit(action.document, token);
      return action;
    },
  };

  const formatDocument = async () => {
    const document = vscode.window.activeTextEditor?.document;
    if (document === undefined) {
      return;
    }
    const edit = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Spotless: formatting",
        cancellable: true,
      },
      (_progress, token) => computeEdit(document, token),
    );
    if (edit !== undefined) {
      await vscode.workspace.applyEdit(edit);
    }
  };

  context.subscriptions.push(
    log,
    vscode.languages.registerCodeActionsProvider(
      { scheme: "file" },
      codeActionProvider,
      { providedCodeActionKinds: [codeActionKind] },
    ),
    vscode.commands.registerCommand(
      "spotlessApplier.formatDocument",
      formatDocument,
    ),
  );
}

function toAbortSignal(token: vscode.CancellationToken): AbortSignal {
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  }
  token.onCancellationRequested(() => {
    controller.abort();
  });
  return controller.signal;
}
