/*
 * NookLab — mobile TipTap bilingual (pt-PT + EN) offline autocorrect adapter.
 * Decompresses the bundled gzip lexicon natively without fetch("file://") or
 * external Worker scripts (both restricted in Android file:// WebViews).
 */
import { mdiSpellcheck } from "@mdi/js";
import type { Editor, TiptapOptions } from "@notesnook/editor";
import { useSyncExternalStore } from "react";
import {
  extractTrailingWordCandidate,
  NookLabAutocorrectEngine
} from "./nooklab-autocorrect-engine.generated";
import { NOOKLAB_LEXICON_GZIP_B64 } from "./nooklab-lexicon.generated";

export const NOOKLAB_AUTOCORRECT_ICON = mdiSpellcheck;

const ENABLED_STORAGE_KEY = "nooklab:mobile:autocorrect";
const IGNORED_STORAGE_KEY = "nooklab:mobile:autocorrectIgnored";
const MAX_IGNORED_WORDS = 500;
const REVERT_WINDOW_MS = 15_000;

type EditorView = Parameters<
  NonNullable<NonNullable<TiptapOptions["editorProps"]>["handleKeyDown"]>
>[0];
type Transaction = Parameters<NonNullable<TiptapOptions["onUpdate"]>>[0]["transaction"];

type LastCorrection = {
  from: number;
  to: number;
  sepLen: number;
  original: string;
  replacement: string;
  time: number;
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const listeners = new Set<() => void>();
let enabledState: boolean = readStorage<boolean>(ENABLED_STORAGE_KEY, true);
let ignoredWords: string[] = loadIgnoredWords();
let engineInstance: NookLabAutocorrectEngine | null = null;
let enginePromise: Promise<NookLabAutocorrectEngine | null> | null = null;
let warmupTimer: ReturnType<typeof setTimeout> | null = null;
const lastCorrectionByView = new WeakMap<EditorView, LastCorrection>();
const lastScheduledSignatureByView = new WeakMap<EditorView, string>();

function loadIgnoredWords(): string[] {
  const saved = readStorage<unknown>(IGNORED_STORAGE_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase())
    .slice(-MAX_IGNORED_WORDS);
}

function notifyListeners() {
  for (const listener of listeners) listener();
}

export function isAutocorrectEnabled(): boolean {
  return enabledState;
}

export function setAutocorrectEnabled(next: boolean) {
  if (enabledState === next) return;
  enabledState = next;
  writeStorage(ENABLED_STORAGE_KEY, next);
  if (next) scheduleWarmup(50);
  notifyListeners();
}

export function toggleAutocorrect() {
  setAutocorrectEnabled(!enabledState);
}

export function useAutocorrectEnabled(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => enabledState,
    () => enabledState
  );
}

export function ignoreAutocorrectWord(word: string) {
  const clean = word.trim().toLowerCase();
  if (!clean || ignoredWords.includes(clean)) return;
  ignoredWords = [...ignoredWords.slice(-(MAX_IGNORED_WORDS - 1)), clean];
  writeStorage(IGNORED_STORAGE_KEY, ignoredWords);
  engineInstance?.addIgnoredWord(clean);
}

async function decodeLexiconText(): Promise<string> {
  const bin = atob(NOOKLAB_LEXICON_GZIP_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  const Decomp = (
    globalThis as unknown as {
      DecompressionStream?: new (format: string) => TransformStream<Uint8Array, Uint8Array>;
    }
  ).DecompressionStream;
  if (!Decomp) {
    throw new Error("DecompressionStream unavailable");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new Decomp("gzip"));
  return await new Response(stream).text();
}

function ensureEngine(): Promise<NookLabAutocorrectEngine | null> {
  if (engineInstance) return Promise.resolve(engineInstance);
  if (enginePromise) return enginePromise;

  enginePromise = (async () => {
    try {
      const text = await decodeLexiconText();
      // Yield once between gzip decode and TypedArray index construction so UI stays smooth.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const engine = new NookLabAutocorrectEngine(text, ignoredWords);
      engineInstance = engine;
      return engine;
    } catch {
      return null;
    }
  })();

  return enginePromise;
}

export function scheduleWarmup(delayMs = 600) {
  if (!enabledState || engineInstance || enginePromise || warmupTimer) return;
  warmupTimer = setTimeout(() => {
    warmupTimer = null;
    if (enabledState) ensureEngine().catch(() => {});
  }, delayMs);
}

function applyAutocorrectResult(
  view: EditorView,
  wordFrom: number,
  wordTo: number,
  sepLen: number,
  original: string,
  replacement: string
) {
  if (view.isDestroyed || !view.editable || !enabledState) return;
  if (view.composing) return;
  if (replacement === original) return;

  const { state } = view;
  if (wordFrom < 0 || wordTo > state.doc.content.size || wordFrom >= wordTo) {
    return;
  }
  const currentSlice = state.doc.textBetween(wordFrom, wordTo, "\n", " ");
  if (currentSlice !== original) return;

  const $inside = state.doc.resolve(Math.min(wordFrom + 1, wordTo));
  const marks = $inside.marks();
  if (marks.some((m) => m.type.name === "code" || m.type.name === "link")) {
    return;
  }

  const tr = state.tr.replaceWith(
    wordFrom,
    wordTo,
    state.schema.text(replacement, marks)
  );
  tr.setMeta("nooklabAutocorrect", true);
  view.dispatch(tr);

  lastCorrectionByView.set(view, {
    from: wordFrom,
    to: wordFrom + replacement.length,
    sepLen,
    original,
    replacement,
    time: Date.now()
  });
}

function getTrailingTextSegment(
  blockNode: Editor["state"]["doc"],
  maxOffset: number
): { text: string; offsetStartInBlock: number } | null {
  let acc = "";
  let segmentStart = maxOffset;
  let cursor = 0;

  for (let i = 0; i < blockNode.childCount; i++) {
    const child = blockNode.child(i);
    const childEnd = cursor + child.nodeSize;
    if (cursor >= maxOffset) break;

    if (child.isText && child.text) {
      const sliceEnd = Math.min(maxOffset - cursor, child.text.length);
      if (acc.length === 0) segmentStart = cursor;
      acc += child.text.slice(0, sliceEnd);
    } else {
      acc = "";
      segmentStart = childEnd;
    }
    cursor = childEnd;
  }

  return acc.length > 0 ? { text: acc, offsetStartInBlock: segmentStart } : null;
}

function scheduleCheckFromBlockEnd(
  view: EditorView,
  blockNode: Editor["state"]["doc"],
  blockContentStartPos: number,
  maxOffset: number,
  trimEndChars: number,
  cursorSepOffset: number
) {
  if (blockNode.type.name === "codeBlock") return;
  const seg = getTrailingTextSegment(blockNode, maxOffset);
  if (!seg) return;

  const trimmedEnd =
    trimEndChars > 0 ? seg.text.slice(0, seg.text.length - trimEndChars) : seg.text;
  const cand = extractTrailingWordCandidate(trimmedEnd);
  if (!cand) return;

  const wordFrom =
    blockContentStartPos + seg.offsetStartInBlock + cand.wordOffset;
  const wordTo = wordFrom + cand.token.length;
  const signature = `${wordFrom}:${wordTo}:${cand.token}`;
  if (lastScheduledSignatureByView.get(view) === signature) return;
  lastScheduledSignatureByView.set(view, signature);

  if (engineInstance) {
    const replacement = engineInstance.checkWord(cand.token, cand.prevWord);
    if (replacement) {
      applyAutocorrectResult(
        view,
        wordFrom,
        wordTo,
        cursorSepOffset,
        cand.token,
        replacement
      );
    }
    return;
  }

  ensureEngine()
    .then((engine) => {
      if (!engine) return;
      const replacement = engine.checkWord(cand.token, cand.prevWord);
      if (replacement) {
        applyAutocorrectResult(
          view,
          wordFrom,
          wordTo,
          cursorSepOffset,
          cand.token,
          replacement
        );
      }
    })
    .catch(() => {});
}

export function handleAutocorrectUpdate(editor: Editor, transaction: Transaction) {
  if (!enabledState || !editor.isEditable) return;
  if (!transaction.docChanged) return;
  if (transaction.getMeta("nooklabAutocorrect")) return;

  const view = editor.view;
  if (transaction.getMeta("history$")) {
    const last = lastCorrectionByView.get(view);
    if (last && last.from >= 0) {
      const slice = editor.state.doc.textBetween(
        last.from,
        Math.min(editor.state.doc.content.size, last.from + last.original.length),
        "\n",
        " "
      );
      if (slice === last.original) {
        ignoreAutocorrectWord(last.original);
        lastCorrectionByView.delete(view);
      }
    }
    return;
  }

  if (transaction.getMeta("paste") || transaction.getMeta("uiEvent") === "paste") {
    return;
  }
  if (view.composing) return;
  if (transaction.doc.content.size <= transaction.before.content.size) {
    return;
  }

  const { selection } = editor.state;
  if (!selection.empty) return;

  const $from = editor.state.doc.resolve(selection.from);
  if ($from.parentOffset > 0) {
    const blockStart = selection.from - $from.parentOffset;
    const textBefore = $from.parent.textBetween(
      Math.max(0, $from.parentOffset - 80),
      $from.parentOffset,
      "\n",
      " "
    );
    const sepMatch = /([ .,;:!?\t]{1,2})$/.exec(textBefore);
    if (!sepMatch) return;
    const sep = sepMatch[1];
    const beforeSep = textBefore.slice(0, textBefore.length - sep.length);
    if (!/[A-Za-zÀ-ÿ]$/.test(beforeSep)) return;

    scheduleCheckFromBlockEnd(
      view,
      $from.parent,
      blockStart,
      $from.parentOffset,
      sep.length,
      sep.length
    );
    return;
  }

  if ($from.depth >= 1) {
    const parentContainer = $from.node($from.depth - 1);
    const prevIdx = $from.index($from.depth - 1) - 1;
    if (prevIdx >= 0) {
      const prevBlock = parentContainer.child(prevIdx);
      if (prevBlock.isTextblock && prevBlock.content.size > 0) {
        const prevBlockContentStart =
          $from.before($from.depth) - prevBlock.nodeSize + 1;
        scheduleCheckFromBlockEnd(
          view,
          prevBlock,
          prevBlockContentStart,
          prevBlock.content.size,
          0,
          2
        );
      }
    }
  }
}

function revertLastCorrection(view: EditorView, last: LastCorrection): boolean {
  const { state } = view;
  if (
    last.from < 0 ||
    last.to > state.doc.content.size ||
    last.from >= last.to
  ) {
    return false;
  }
  const currentSlice = state.doc.textBetween(last.from, last.to, "\n", " ");
  if (currentSlice !== last.replacement) return false;

  const $inside = state.doc.resolve(Math.min(last.from + 1, last.to));
  const tr = state.tr.replaceWith(
    last.from,
    last.to,
    state.schema.text(last.original, $inside.marks())
  );
  tr.setMeta("nooklabAutocorrect", true);
  view.dispatch(tr);

  ignoreAutocorrectWord(last.original);
  lastCorrectionByView.delete(view);
  return true;
}

export function handleAutocorrectKeyDown(
  view: EditorView,
  event: KeyboardEvent
): boolean {
  if (!enabledState || !view.editable || event.isComposing) return false;

  const last = lastCorrectionByView.get(view);
  if (!last) return false;
  if (Date.now() - last.time > REVERT_WINDOW_MS) {
    lastCorrectionByView.delete(view);
    return false;
  }

  const { selection } = view.state;
  if (!selection.empty) return false;

  if (
    event.key === "Backspace" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    selection.from === last.to
  ) {
    if (revertLastCorrection(view, last)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }

  return false;
}
