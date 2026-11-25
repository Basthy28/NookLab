/*
 * NookLab — pure grid layout, color-blending, and HTML preview extraction
 * helpers for ColorNote-style mobile cards.
 */
import type { GroupHeader } from "@notesnook/core";
import { EntityLevel, decode } from "entities";

export const NOOKLAB_GRID_CARD_HEIGHT = 192;
export const NOOKLAB_GRID_ROW_GAP = 10;

export type MobileGridGroupInput = {
  index: number;
  hidden?: boolean;
  group?: GroupHeader;
};

export type MobileGridRow =
  | {
      kind: "section-header";
      key: string;
      itemIndex: number;
      group: GroupHeader;
      showControls: boolean;
    }
  | {
      kind: "pair";
      key: string;
      indices: [number] | [number, number];
    };

function normalizeHex(hex: string): [number, number, number] | null {
  const raw = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return [
      parseInt(raw[0] + raw[0], 16),
      parseInt(raw[1] + raw[1], 16),
      parseInt(raw[2] + raw[2], 16)
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return [
      parseInt(raw.slice(0, 2), 16),
      parseInt(raw.slice(2, 4), 16),
      parseInt(raw.slice(4, 6), 16)
    ];
  }
  return null;
}

/**
 * Blend `foregroundHex` into `backgroundHex` by `weight` (0..1) so note cards
 * get ColorNote-like pastel backgrounds in light mode and muted tints in dark mode.
 */
export function mixHexColor(
  foregroundHex: string,
  backgroundHex: string,
  weight: number
): string {
  const fg = normalizeHex(foregroundHex);
  const bg = normalizeHex(backgroundHex);
  if (!fg || !bg) return foregroundHex;
  const w = Math.max(0, Math.min(1, weight));
  const r = Math.round(fg[0] * w + bg[0] * (1 - w));
  const g = Math.round(fg[1] * w + bg[1] * (1 - w));
  const b = Math.round(fg[2] * w + bg[2] * (1 - w));
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

export function withHexAlpha(hex: string, alpha: number): string {
  const rgb = normalizeHex(hex);
  if (!rgb) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a.toFixed(2)})`;
}

function cleanPreviewLine(text: string): string {
  return text
    .replace(/[\u00a0\u200a\u200b\u200c\u200d\ufeff]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Extract compact plain-text preview lines from TipTap note HTML without
 * relying on browser DOMParser (safe on React Native Hermes).
 */
export function extractNotePreviewLines(
  html: string | undefined,
  title: string | undefined,
  headline: string | undefined,
  maxLines = 6
): string {
  const normalizedTitle = cleanPreviewLine(title || "");
  let lines: string[] = [];

  if (html && html.trim().length > 0) {
    let text = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<hr\s*\/?>/gi, "\n───\n")
      .replace(/<li[^>]*data-checked=["']true["'][^>]*>/gi, "\n☑ ")
      .replace(/<li[^>]*data-checked=["']false["'][^>]*>/gi, "\n☐ ")
      .replace(/<input[^>]*type=["']checkbox["'][^>]*checked[^>]*>/gi, "☑ ")
      .replace(/<input[^>]*type=["']checkbox["'][^>]*>/gi, "☐ ")
      .replace(
        /<\/?(p|div|li|h[1-6]|blockquote|pre|tr|table|ul|ol)[^>]*>/gi,
        "\n"
      )
      .replace(/<[^>]+>/g, "");

    text = decode(text, { level: EntityLevel.HTML });
    lines = text
      .split(/\r?\n/)
      .map(cleanPreviewLine)
      .filter((line) => line.length > 0);
  } else if (headline) {
    const decoded = cleanPreviewLine(
      decode(headline, { level: EntityLevel.HTML })
    );
    if (decoded) lines = [decoded];
  }

  if (lines.length > 0 && normalizedTitle && lines[0] === normalizedTitle) {
    lines = lines.slice(1);
  }

  return lines.slice(0, maxLines).join("\n");
}

/**
 * Build full-width section headers + paired 2-column card rows strictly within
 * each section so headers never get squished into half-width grid cells.
 */
export function buildMobileGridRows(
  totalLength: number,
  groups?: MobileGridGroupInput[] | null
): MobileGridRow[] {
  if (totalLength <= 0) return [];

  const validGroups = (groups || [])
    .filter(
      (g): g is Required<Pick<MobileGridGroupInput, "index" | "group">> &
        MobileGridGroupInput =>
        typeof g?.index === "number" &&
        g.index >= 0 &&
        g.index < totalLength &&
        !g.hidden &&
        !!g.group
    )
    .sort((a, b) => a.index - b.index);

  if (validGroups.length === 0) {
    const rows: MobileGridRow[] = [];
    for (let i = 0; i < totalLength; i += 2) {
      const indices: [number] | [number, number] =
        i + 1 < totalLength ? [i, i + 1] : [i];
      rows.push({
        kind: "pair",
        key: `pair-${i}`,
        indices
      });
    }
    return rows;
  }

  const rows: MobileGridRow[] = [];
  for (let gIdx = 0; gIdx < validGroups.length; gIdx++) {
    const current = validGroups[gIdx];
    const start = current.index;
    const end =
      gIdx + 1 < validGroups.length ? validGroups[gIdx + 1].index : totalLength;
    if (start >= end) continue;

    rows.push({
      kind: "section-header",
      key: `hdr-${start}-${current.group.title}`,
      itemIndex: start,
      group: current.group,
      showControls: gIdx === 0
    });

    for (let i = start; i < end; i += 2) {
      const indices: [number] | [number, number] =
        i + 1 < end ? [i, i + 1] : [i];
      rows.push({
        kind: "pair",
        key: `pair-${i}`,
        indices
      });
    }
  }

  return rows;
}
