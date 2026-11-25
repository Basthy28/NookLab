/*
 * NookLab — TipTap integration and lifecycle manager for bilingual (pt-PT + EN)
 * autocorrect, supporting desktop keyboards, mobile IME commits, instant revert
 * via Ctrl+Z or double Backspace, and persistent per-device toggle/ignore list.
 */
import { mdiSpellcheck } from "@mdi/js";
import type { Editor, TiptapOptions } from "@notesnook/editor";
import { useSyncExternalStore } from "react";
import Config from "../utils/config";
import {
  extractTrailingWordCandidate,
  NookLabAutocorrectEngine
} from "./nooklab-autocorrect-engine";
import type {
  AutocorrectWorkerRequest,
  AutocorrectWorkerResponse
} from "./nooklab-autocorrect.worker";
import AutocorrectWorker from "./nooklab-autocorrect.worker.ts?worker";

export const NOOKLAB_AUTOCORRECT_ICON = mdiSpellcheck;

const ENABLED_STORAGE_KEY = "nooklab:autocorrect";
const IGNORED_STORAGE_KEY = "nooklab:autocorrectIgnored";
const MAX_IGNORED_WORDS = 500;
const REVERT_WINDOW_MS = 15_000;

type EditorView = Parameters<
  NonNullable<NonNullable<TiptapOptions["editorProps"]>["handleKeyDown"]>
>[0];
type Transaction = Parameters<NonNullable<TiptapOptions["onUpdate"]>>[0]["transaction"];

type PendingCheck = {
  id: number;
  view: EditorView;
  wordFrom: number;
  wordTo: number;
  sepLen: number;
  original: string;
  prevWord: string;
};

type LastCorrection = {
  from: number;
  to: number;
  sepLen: number;
  original: string;
  replacement: string;
  time: number;
};

const listeners = new Set<() => void>();
let enabledState: boolean = Config.get(ENABLED_STORAGE_KEY, true);
let ignoredWords: string[] = loadIgnoredWords();

let worker: Worker | null = null;
let fallbackEngine: NookLabAutocorrectEngine | null = null;
let nextRequestId = 1;
const pendingChecks = new Map<number, PendingCheck>();
const lastCorrectionByView = new WeakMap<EditorView, LastCorrection>();
const lastScheduledSignatureByView = new WeakMap<EditorView, string>();

function loadIgnoredWords(): string[] {
  const saved = Config.get<unknown>(IGNORED_STORAGE_KEY, []);
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
  Config.set(ENABLED_STORAGE_KEY, next);
  if (!next && worker) {
    worker.terminate();
    worker = null;
    pendingChecks.clear();
  }
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
  Config.set(IGNORED_STORAGE_KEY, ignoredWords);
  worker?.postMessage({
    type: "ignore",
    word: clean
  } satisfies AutocorrectWorkerRequest);
  fallbackEngine?.addIgnoredWord(clean);
}

function ensureWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  if (worker) return worker;

  try {
    const instance = new AutocorrectWorker();
    instance.addEventListener(
      "message",
      (event: MessageEvent<AutocorrectWorkerResponse>) => {
        const msg = event.data;
        if (msg.type !== "result") return;
        const pending = pendingChecks.get(msg.id);
        if (!pending) return;
        pendingChecks.delete(msg.id);
        if (msg.replacement) {
          applyAutocorrectResult(pending, msg.replacement);
        }
      }
    );
    instance.postMessage({
      type: "init",
      ignoredWords
    } satisfies AutocorrectWorkerRequest);
    worker = instance;
    return worker;
  } catch {
    return null;
  }
}

function applyAutocorrectResult(pending: PendingCheck, replacement: string) {
  const { view, wordFrom, wordTo, sepLen, original } = pending;
  if (view.isDestroyed || !view.editable || !enabledState) return;
  if (replacement === original) return;

  const { state } = view;
  if (wordFrom < 0 || wordTo > state.doc.content.size || wordFrom >= wordTo) {
    return;
  }
  const currentSlice = state.doc.textBetween(wordFrom, wordTo, "\n", " ");
  if (currentSlice !== original) return;

  const $inside = state.doc.resolve(Math.min(wordFrom + 1, wordTo));
  const marks = $inside.marks();
  if (
    marks.some((m) => m.type.name === "code" || m.type.name === "link")
  ) {
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

function requestCheck(pending: Omit<PendingCheck, "id">) {
  const activeWorker = ensureWorker();
  if (activeWorker) {
    const id = nextRequestId++;
    pendingChecks.set(id, { ...pending, id });
    activeWorker.postMessage({
      type: "check",
      id,
      token: pending.original,
      prevWord: pending.prevWord
    } satisfies AutocorrectWorkerRequest);
    return;
  }

  if (fallbackEngine) {
    const replacement = fallbackEngine.checkWord(
      pending.original,
      pending.prevWord
    );
    if (replacement) {
      applyAutocorrectResult({ ...pending, id: 0 }, replacement);
    }
  }
}

export function setAutocorrectFallbackEngineForTesting(
  engine: NookLabAutocorrectEngine | null
) {
  fallbackEngine = engine;
}

/**
 * Extracts contiguous trailing text up to `maxOffset` within a textblock
 * while preserving exact 1:1 ProseMirror UTF-16 offset mapping.
 */
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

  requestCheck({
    view,
    wordFrom,
    wordTo,
    sepLen: cursorSepOffset,
    original: cand.token,
    prevWord: cand.prevWord
  });
}

/**
 * Inspects committed editor updates (desktop keystrokes, Enter splits, mobile
 * Gboard/iOS IME commits) and dispatches high-confidence word corrections.
 */
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

  // Never autocorrect when content shrank (Backspace / Delete).
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

  // Trigger on Enter paragraph split when cursor lands at offset 0 of a new block.
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

function revertLastCorrection(
  view: EditorView,
  last: LastCorrection
): boolean {
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

/**
 * Intercepts immediate Ctrl+Z (with cursor at end of replacement+separator) or
 * Backspace (with cursor at end of replacement, e.g. on mobile keyboards) to
 * revert an unwanted correction and add the original word to the skip list.
 */
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

  if (
    (event.ctrlKey || event.metaKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === "z" &&
    selection.from === last.to + last.sepLen
  ) {
    if (revertLastCorrection(view, last)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }
  }

  return false;
}
