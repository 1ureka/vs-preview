import * as vscode from "vscode";
import { ImageViewerEditorProvider } from "@host/provider";

/**
 * 啟動圖片檢視器功能，註冊自訂編輯器
 */
export function activate(context: vscode.ExtensionContext) {
  const provider = new ImageViewerEditorProvider(context);

  const providerRegistration = vscode.window.registerCustomEditorProvider("1ureka.vscode.preview.image", provider, {
    webviewOptions: { retainContextWhenHidden: true },
    supportsMultipleEditorsPerDocument: false,
  });

  context.subscriptions.push(providerRegistration);
}
