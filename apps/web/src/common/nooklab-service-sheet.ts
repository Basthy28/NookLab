/*
 * NookLab — TipTap integration and clipboard/print actions for Service Sheet.
 */
import type { Editor } from "@notesnook/editor";
import { writeToClipboard } from "../utils/clipboard";
import { showToast } from "../utils/toast";
import { exportToPDF } from "./export";
import {
  cleanHtmlWithoutSpacing,
  loadServiceSheetSettings,
  packBottomToFit,
  type ServiceSheetSettings
} from "./nooklab-service-sheet-core";

export * from "./nooklab-service-sheet-core";

export function getActiveNoteTitle(editor: Editor): string {
  const root = editor.view.dom.closest(".editor") || document;
  const titleInput = root.querySelector<HTMLTextAreaElement>(
    "textarea[data-test-id='editor-title'], .editor-title textarea, textarea"
  );
  const value = titleInput?.value?.trim();
  return value || "NookLab Service Sheet";
}

function getSelectionHtml(editor: Editor): string | null {
  const { selection } = editor.state;
  if (selection.empty) return null;

  const serializer = editor.view.someProp("clipboardSerializer");
  if (serializer) {
    const fragment = serializer.serializeFragment(selection.content().content);
    const holder = document.createElement("div");
    holder.appendChild(fragment);
    return holder.innerHTML;
  }

  return null;
}

async function writeWordClipboard(html: string, plainText: string) {
  // Synchronous copy event mirrors native Ctrl+C in Chromium and avoids Blink's
  // async ClipboardItem HTML sanitizer altering inline Word spacing/color styles.
  let handled = false;
  if (
    typeof document !== "undefined" &&
    typeof document.execCommand === "function" &&
    document.body
  ) {
    const sel = window.getSelection();
    const savedRanges: Range[] = [];
    if (sel) {
      for (let i = 0; i < sel.rangeCount; i++) {
        savedRanges.push(sel.getRangeAt(i).cloneRange());
      }
    }

    const helper = document.createElement("span");
    helper.textContent = "copy";
    helper.style.cssText =
      "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;user-select:text;";
    document.body.appendChild(helper);

    const onCopy = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      e.clipboardData.setData("text/html", html);
      e.clipboardData.setData("text/plain", plainText);
      handled = true;
    };

    document.addEventListener("copy", onCopy, true);
    try {
      if (sel) {
        const range = document.createRange();
        range.selectNodeContents(helper);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      document.execCommand("copy");
    } finally {
      document.removeEventListener("copy", onCopy, true);
      helper.remove();
      if (sel) {
        sel.removeAllRanges();
        for (const r of savedRanges) sel.addRange(r);
      }
    }
  }

  if (!handled) {
    await writeToClipboard({
      "text/html": html,
      "text/plain": plainText
    });
  }
}

export async function copyPackedServiceSheet(
  editor: Editor,
  settings: ServiceSheetSettings
): Promise<boolean> {
  const packed = packBottomToFit(
    editor.getHTML(),
    settings,
    getActiveNoteTitle(editor)
  );
  if (!packed.plainText) {
    showToast("error", "Nothing to copy.");
    return false;
  }

  await writeWordClipboard(packed.wordHtml, packed.plainText);
  showToast(
    "success",
    packed.groupCount > 1
      ? `Copied ${packed.groupCount} entries (~${packed.estimatedLines} lines) without spacing`
      : `Copied ~${packed.estimatedLines} lines without spacing`
  );
  return true;
}

export async function printPackedServiceSheet(
  editor: Editor,
  settings: ServiceSheetSettings
): Promise<boolean> {
  const title = getActiveNoteTitle(editor);
  const packed = packBottomToFit(editor.getHTML(), settings, title);
  if (!packed.plainText) {
    showToast("error", "Nothing to print.");
    return false;
  }
  return exportToPDF(title, packed.printHtml);
}

export async function copySelectionWithoutSpacing(
  editor: Editor,
  settings: ServiceSheetSettings
): Promise<boolean> {
  const rawHtml = getSelectionHtml(editor) ?? editor.getHTML();
  const cleaned = cleanHtmlWithoutSpacing(rawHtml, settings);
  if (!cleaned.plainText) {
    showToast("error", "Nothing to copy.");
    return false;
  }

  await writeWordClipboard(cleaned.wordHtml, cleaned.plainText);
  showToast("success", `Copied ${cleaned.lineCount} lines without spacing`);
  return true;
}

export function handleCompactCopyKeyDown(
  editor: Editor,
  event: KeyboardEvent
): boolean {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "c"
  ) {
    event.preventDefault();
    event.stopPropagation();
    void copySelectionWithoutSpacing(editor, loadServiceSheetSettings());
    return true;
  }
  return false;
}
