/*
 * NookLab — mobile clipboard bridge for 1-page bottom-up Service Sheet and
 * compact clean copy inside React Native Android/iOS WebView.
 */
import type { Editor } from "@notesnook/editor";
import {
  cleanHtmlWithoutSpacing,
  loadServiceSheetSettings,
  packBottomToFit,
  saveServiceSheetSettings,
  type PackResult,
  type ServiceSheetMode,
  type ServiceSheetSettings
} from "./nooklab-service-sheet-core.generated";

export {
  cleanHtmlWithoutSpacing,
  loadServiceSheetSettings,
  packBottomToFit,
  saveServiceSheetSettings,
  type PackResult,
  type ServiceSheetMode,
  type ServiceSheetSettings
};

function sendToNativeClipboard(
  tabId: string,
  plainText: string,
  wordHtml: string,
  toast: string
) {
  const controller = globalThis.editorControllers?.[tabId] as
    | { copyToClipboard?: (text: string, html?: string, toast?: string) => void }
    | undefined;
  controller?.copyToClipboard?.(plainText, wordHtml, toast);
}

export function copyPackedServiceSheet(
  tabId: string,
  editor: Editor,
  settings: ServiceSheetSettings,
  noteTitle: string
): PackResult {
  const packed = packBottomToFit(editor.getHTML(), settings, noteTitle);
  if (packed.lineCount === 0) return packed;

  const toast =
    packed.groupCount > 1
      ? `Copied 1 page (${packed.groupCount} entries, ${packed.lineCount} lines)`
      : `Copied 1 page (${packed.lineCount} lines)`;
  sendToNativeClipboard(tabId, packed.plainText, packed.wordHtml, toast);
  return packed;
}

export function copyAllCleanServiceSheet(
  tabId: string,
  editor: Editor,
  settings: ServiceSheetSettings
): boolean {
  const cleaned = cleanHtmlWithoutSpacing(editor.getHTML(), settings);
  if (cleaned.lineCount === 0) return false;

  sendToNativeClipboard(
    tabId,
    cleaned.plainText,
    cleaned.wordHtml,
    `Copied all clean (${cleaned.lineCount} lines)`
  );
  return true;
}
