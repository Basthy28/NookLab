/*
 * NookLab — batched SQLite preview loader for mobile grid note cards.
 * Fetches only visible notes' content from local SQLite with a bounded LRU cache.
 */
import type { HighlightedResult, Note } from "@notesnook/core";
import { useEffect, useState } from "react";
import { db } from "../../common/database";
import { extractNotePreviewLines } from "./grid-helpers";

const MAX_CACHE_ENTRIES = 600;
const previewCache = new Map<string, string>();
const listeners = new Map<string, Set<(value: string) => void>>();

type PendingNote = {
  cacheKey: string;
  noteId: string;
  contentId?: string;
  title: string;
  headline: string;
};

const pendingQueue = new Map<string, PendingNote>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function setCache(key: string, value: string) {
  if (previewCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  previewCache.set(key, value);
}

function notifyKey(key: string, value: string) {
  const subs = listeners.get(key);
  if (!subs) return;
  subs.forEach((cb) => cb(value));
}

async function flushQueue() {
  flushTimer = null;
  if (pendingQueue.size === 0) return;

  const batch = Array.from(pendingQueue.values());
  pendingQueue.clear();

  const noteIds = Array.from(new Set(batch.map((item) => item.noteId)));
  const contentByNoteId = new Map<string, string>();

  try {
    const rows = await db
      .sql()
      .selectFrom("content")
      .where("noteId", "in", noteIds)
      .select(["noteId", "data", "locked"])
      .execute();

    for (const row of rows) {
      if (row.noteId && !row.locked && typeof row.data === "string") {
        contentByNoteId.set(row.noteId, row.data);
      }
    }
  } catch {
    // Fallback to headline when content query is unavailable
  }

  for (const item of batch) {
    const html = contentByNoteId.get(item.noteId);
    const preview = extractNotePreviewLines(html, item.title, item.headline);
    setCache(item.cacheKey, preview);
    notifyKey(item.cacheKey, preview);
  }
}

export function useNotePreview(
  item: Note | HighlightedResult,
  locked?: boolean
): string {
  const isSearchResult = item.type === "searchResult";
  const fallback = isSearchResult
    ? ""
    : extractNotePreviewLines(undefined, item.title, item.headline || "");
  const cacheKey = isSearchResult
    ? `sr:${item.id}`
    : `${item.id}:${item.dateModified}:${item.contentId || ""}`;

  const [preview, setPreview] = useState<string>(() => {
    if (locked || isSearchResult) return "";
    return previewCache.get(cacheKey) ?? fallback;
  });

  useEffect(() => {
    if (locked || isSearchResult) {
      setPreview("");
      return;
    }

    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) {
      setPreview(cached);
      return;
    }

    setPreview(fallback);

    let keyListeners = listeners.get(cacheKey);
    if (!keyListeners) {
      keyListeners = new Set();
      listeners.set(cacheKey, keyListeners);
    }
    keyListeners.add(setPreview);

    if (!pendingQueue.has(cacheKey) && item.type === "note") {
      pendingQueue.set(cacheKey, {
        cacheKey,
        noteId: item.id,
        contentId: item.contentId,
        title: item.title || "",
        headline: item.headline || ""
      });
    }

    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushQueue().catch(() => {});
      }, 16);
    }

    return () => {
      const subs = listeners.get(cacheKey);
      subs?.delete(setPreview);
      if (subs && subs.size === 0) listeners.delete(cacheKey);
    };
  }, [cacheKey, fallback, isSearchResult, item, locked]);

  return preview;
}
