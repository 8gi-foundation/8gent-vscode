import * as vscode from "vscode";
import type { WorkspaceContext } from "./types";

/** Gather workspace context from the active editor */
export function gatherContext(): WorkspaceContext {
  const editor = vscode.window.activeTextEditor;
  const ctx: WorkspaceContext = {};

  // Workspace root
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) {
    ctx.workspaceRoot = folders[0].uri.fsPath;
  }

  // Active file
  if (editor) {
    const doc = editor.document;
    ctx.activeFile = {
      path: vscode.workspace.asRelativePath(doc.uri),
      language: doc.languageId,
      content: doc.getText(),
    };

    // Selection
    const sel = editor.selection;
    if (!sel.isEmpty) {
      ctx.selection = {
        text: doc.getText(sel),
        startLine: sel.start.line + 1,
        endLine: sel.end.line + 1,
      };
    }
  }

  // Open files (just paths, not content)
  ctx.openFiles = vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => {
      const input = tab.input;
      if (input && typeof input === "object" && "uri" in input) {
        return vscode.workspace.asRelativePath((input as { uri: vscode.Uri }).uri);
      }
      return null;
    })
    .filter((p): p is string => p !== null)
    .slice(0, 20); // cap at 20 to avoid bloating context

  return ctx;
}
