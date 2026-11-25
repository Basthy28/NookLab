/*
 * NookLab — lightweight multi-line body preview extractor for grid cards.
 *
 * Notesnook's `headline` only stores the first <p> block, leaving cards sparse
 * when the first line is blank or duplicates the title. Here we batch-read
 * only the currently visible notes from local SQLite with an in-memory cache,
 * without touching the database or triggering sync.
 */
import { isDeleted, Note as NoteType } from "@notesnook/core";
import { useEffect, useState } from "react";
import { db } from "../../common/db";

const MAX_CACHE_ENTRIES = 600;
const MAX_PREVIEW_CHARS = 480;
const MAX_PREVIEW_LINES = 10;

const previewCache = new Map<string, string>();
const listeners = new Map<string, Set<(value: string) => void>>();

type PendingItem = {
  cacheKey: string;
  noteId: string;
  contentId?: string;
  title: string;
  headline: string;
};

const pendingQueue = new Map<string, PendingItem>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function cleanText(text: string): string {
  return text
    .replace(/[\u00a0\u200a\u200b\u200c\u200d\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

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

function extractLinesFromHtml(html: string): string[] {
  if (!html) return [];

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const lines: string[] = [];
    const blockTags = new Set([
      "P",
      "DIV",
      "H1",
      "H2",
      "H3",
      "H4",
      "H5",
      "H6",
      "LI",
      "BLOCKQUOTE",
      "PRE",
      "TR"
    ]);

    function collectInline(node: Node, buf: string[]) {
      if (node.nodeType === Node.TEXT_NODE) {
        buf.push(node.textContent || "");
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName;

      if (tag === "BR") {
        buf.push("\n");
        return;
      }
      if (tag === "INPUT" && (el as HTMLInputElement).type === "checkbox") {
        buf.push((el as HTMLInputElement).checked ? "☑ " : "☐ ");
        return;
      }
      if (tag === "IMG") {
        // Images are shown as attachment counts in the card footer, matching other views.
        return;
      }
      if (blockTags.has(tag)) {
        // Let nested block elements emit their own lines (e.g. <li><p>...</p></li>).
        const hasChildBlocks = Array.from(el.children).some((c) =>
          blockTags.has(c.tagName)
        );
        if (hasChildBlocks) {
          el.childNodes.forEach((child) => collectInline(child, buf));
          return;
        }
        const inner: string[] = [];
        if (tag === "LI" && el.getAttribute("data-checked") !== null) {
          inner.push(el.getAttribute("data-checked") === "true" ? "☑ " : "☐ ");
        }
        el.childNodes.forEach((child) => collectInline(child, inner));
        const joined = inner.join("");
        joined.split("\n").forEach((part) => {
          const cleaned = cleanText(part);
          if (cleaned) lines.push(cleaned);
        });
        return;
      }

      el.childNodes.forEach((child) => collectInline(child, buf));
    }

    const looseBuf: string[] = [];
    doc.body.childNodes.forEach((child) => {
      if (
        child.nodeType === Node.ELEMENT_NODE &&
        blockTags.has((child as HTMLElement).tagName)
      ) {
        if (looseBuf.length) {
          looseBuf
            .join("")
            .split("\n")
            .forEach((p) => {
              const cleaned = cleanText(p);
              if (cleaned) lines.push(cleaned);
            });
          looseBuf.length = 0;
        }
        collectInline(child, []);
      } else {
        collectInline(child, looseBuf);
      }
    });
    if (looseBuf.length) {
      looseBuf
        .join("")
        .split("\n")
        .forEach((p) => {
          const cleaned = cleanText(p);
          if (cleaned) lines.push(cleaned);
        });
    }
    return lines;
  }

  return html
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map(cleanText)
    .filter(Boolean);
}

function formatPreview(
  rawData: unknown,
  title: string,
  fallbackHeadline: string
): string {
  if (typeof rawData !== "string" || !rawData.trim()) {
    return cleanText(fallbackHeadline);
  }

  const lines = extractLinesFromHtml(rawData);
  if (!lines.length) return cleanText(fallbackHeadline);

  const normalizedTitle = cleanText(title).toLowerCase();
  const filtered =
    normalizedTitle &&
    lines.length > 1 &&
    lines[0].toLowerCase() === normalizedTitle
      ? lines.slice(1)
      : lines;

  const picked = filtered.slice(0, MAX_PREVIEW_LINES).join("\n");
  if (picked.length <= MAX_PREVIEW_CHARS) return picked;
  return picked.slice(0, MAX_PREVIEW_CHARS).trimEnd() + "…";
}

async function flushBatch() {
  flushTimer = null;
  const batch = Array.from(pendingQueue.values());
  pendingQueue.clear();
  if (!batch.length) return;

  try {
    const noteIds = Array.from(new Set(batch.map((item) => item.noteId)));
    const rows = await db
      .sql()
      .selectFrom("content")
      .where("noteId", "in", noteIds)
      .select(["id", "noteId", "data", "locked", "deleted"])
      .execute();

    const byContentId = new Map<string, (typeof rows)[number]>();
    const byNoteId = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (isDeleted(row as never)) continue;
      if (row.id) byContentId.set(row.id, row);
      if (row.noteId && !byNoteId.has(row.noteId)) {
        byNoteId.set(row.noteId, row);
      }
    }

    for (const item of batch) {
      const row =
        (item.contentId ? byContentId.get(item.contentId) : undefined) ||
        byNoteId.get(item.noteId);
      const preview =
        row && !row.locked
          ? formatPreview(row.data, item.title, item.headline)
          : cleanText(item.headline);
      setCache(item.cacheKey, preview);
      notifyKey(item.cacheKey, preview);
    }
  } catch {
    for (const item of batch) {
      const fallback = cleanText(item.headline);
      setCache(item.cacheKey, fallback);
      notifyKey(item.cacheKey, fallback);
    }
  }
}

function requestPreview(item: PendingItem) {
  if (previewCache.has(item.cacheKey)) return;
  pendingQueue.set(item.cacheKey, item);
  if (!flushTimer) {
    flushTimer = setTimeout(flushBatch, 10);
  }
}

export function useNoteBodyPreview(note: NoteType, locked?: boolean): string {
  const fallback = cleanText(note.headline || "");
  const cacheKey = `${note.id}:${note.dateEdited}:${note.contentId || ""}`;

  const [preview, setPreview] = useState<string>(() => {
    if (locked) return "";
    return previewCache.get(cacheKey) ?? fallback;
  });

  useEffect(() => {
    if (locked) {
      setPreview("");
      return;
    }

    const cached = previewCache.get(cacheKey);
    if (cached !== undefined) {
      setPreview(cached);
      return;
    }

    setPreview(fallback);

    let subs = listeners.get(cacheKey);
    if (!subs) {
      subs = new Set();
      listeners.set(cacheKey, subs);
    }
    const listener = (value: string) => setPreview(value);
    subs.add(listener);

    requestPreview({
      cacheKey,
      noteId: note.id,
      contentId: note.contentId,
      title: note.title || "",
      headline: note.headline || ""
    });

    return () => {
      const currentSubs = listeners.get(cacheKey);
      if (!currentSubs) return;
      currentSubs.delete(listener);
      if (currentSubs.size === 0) listeners.delete(cacheKey);
    };
  }, [cacheKey, fallback, locked, note.contentId, note.id, note.title]);

  return preview;
}
