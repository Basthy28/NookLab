/*
 * NookLab — pure parser and bottom-up 1-page packer for service sheets and
 * spacing-free Word/A4 formatting.
 */
import Config from "../utils/config";

export type ServiceSheetMode = "word" | "a4" | "lines";

export type ServiceSheetSettings = {
  mode: ServiceSheetMode;
  fontSizePt: number;
  maxLines: number;
  wholeBlocksOnly: boolean;
  removeEmptyLines: boolean;
};

export const DEFAULT_SERVICE_SHEET_SETTINGS: ServiceSheetSettings = {
  mode: "word",
  fontSizePt: 11.5,
  maxLines: 40,
  wholeBlocksOnly: true,
  removeEmptyLines: true
};

const SETTINGS_STORAGE_KEY = "nooklab:serviceSheetSettings:v4";

const SEPARATOR_TEXT_RE = /^[_\-=─━]{5,}$/;

const PLAIN_SEPARATOR = "________________________________________";

const HR_SEPARATOR_HTML =
  '<hr size="1" noshade="noshade" style="border:none;border-top:1px solid #555555;color:#555555;background-color:#555555;height:1px;margin:2pt 0;padding:0;" />';

const PRINT_SEPARATOR_HTML =
  '<hr style="border:none;border-top:1px solid #666666;margin:6pt 0;padding:0;height:0;" />';

function getWordParagraphStyle(fontSizePt: number): string {
  return (
    `margin:0pt;margin-top:0pt;margin-bottom:0pt;padding:0pt;` +
    `font-family:Calibri,Arial,sans-serif;font-size:${fontSizePt}pt;line-height:1.08;` +
    `mso-margin-top-alt:0pt;mso-margin-bottom-alt:0pt;` +
    `mso-para-margin-top:0pt;mso-para-margin-bottom:0pt;`
  );
}

export type RenderedUnit = {
  kind: "line" | "separator";
  tagName?: string;
  innerHtml?: string;
  html: string;
  plainText: string;
  estimatedLines: number;
};

export type ServiceGroup = {
  units: RenderedUnit[];
  separatorAfter?: RenderedUnit;
  previewLabel: string;
  estimatedLines: number;
};

export type PackResult = {
  wordHtml: string;
  printHtml: string;
  plainText: string;
  groupCount: number;
  lineCount: number;
  estimatedLines: number;
  firstLinePreview: string;
  lastLinePreview: string;
};

export function loadServiceSheetSettings(): ServiceSheetSettings {
  const saved = Config.get<Partial<ServiceSheetSettings>>(
    SETTINGS_STORAGE_KEY,
    {}
  );
  const mode: ServiceSheetMode =
    saved.mode === "a4" || saved.mode === "lines" || saved.mode === "word"
      ? saved.mode
      : DEFAULT_SERVICE_SHEET_SETTINGS.mode;
  return {
    mode,
    fontSizePt: clampNumber(
      saved.fontSizePt,
      8.5,
      13,
      DEFAULT_SERVICE_SHEET_SETTINGS.fontSizePt
    ),
    maxLines: Math.round(
      clampNumber(
        saved.maxLines,
        20,
        90,
        DEFAULT_SERVICE_SHEET_SETTINGS.maxLines
      )
    ),
    wholeBlocksOnly:
      typeof saved.wholeBlocksOnly === "boolean"
        ? saved.wholeBlocksOnly
        : DEFAULT_SERVICE_SHEET_SETTINGS.wholeBlocksOnly,
    removeEmptyLines:
      typeof saved.removeEmptyLines === "boolean"
        ? saved.removeEmptyLines
        : DEFAULT_SERVICE_SHEET_SETTINGS.removeEmptyLines
  };
}

export function saveServiceSheetSettings(next: ServiceSheetSettings) {
  Config.set(SETTINGS_STORAGE_KEY, next);
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeText(text: string): string {
  return text.replace(/\u00a0/g, " ").trim();
}

function getPageDimensionsMm(settings: ServiceSheetSettings) {
  // "word" mirrors Word's default blank A4 sheet in pt-PT (25mm top/bottom, 30mm left/right)
  // with an explicit ~6-line safety cushion so Word style metrics never spill onto page 2.
  if (settings.mode === "a4") {
    return {
      marginTopBottomMm: 12,
      marginLeftRightMm: 14,
      printableWidthMm: 182,
      printableHeightMm: 262
    };
  }
  return {
    marginTopBottomMm: 25,
    marginLeftRightMm: 30,
    printableWidthMm: 150,
    printableHeightMm: 196
  };
}

function estimateCharsPerLine(settings: ServiceSheetSettings): number {
  const { printableWidthMm } = getPageDimensionsMm(settings);
  const ptsWide = (printableWidthMm / 25.4) * 72;
  // Calibri average glyph + spacing width across typical mixed Portuguese addresses/caps.
  return Math.max(38, Math.floor(ptsWide / (settings.fontSizePt * 0.48)));
}

function estimateLinesForText(
  text: string,
  settings: ServiceSheetSettings
): number {
  const clean = normalizeText(text);
  if (!clean) return 1;
  return Math.max(1, Math.ceil(clean.length / estimateCharsPerLine(settings)));
}

function stripBlockMetadata(el: Element) {
  el.removeAttribute("data-block-id");
  el.removeAttribute("data-spacing");
  el.removeAttribute("class");
  for (const child of Array.from(
    el.querySelectorAll("[data-block-id],[data-spacing]")
  )) {
    child.removeAttribute("data-block-id");
    child.removeAttribute("data-spacing");
  }
}

function mergeCompactParagraphStyle(el: HTMLElement, fontSizePt: number) {
  const prev = el.getAttribute("style");
  const filtered = prev
    ? prev
      .split(";")
      .map((s) => s.trim())
      .filter(
        (s) =>
          s &&
          !/^(margin|margin-top|margin-bottom|padding|line-height|font-size|font-family|mso-margin|mso-para-margin)/i.test(
            s
          )
      )
      .join(";")
    : "";
  const baseStyle = getWordParagraphStyle(fontSizePt);
  el.setAttribute("style", filtered ? `${baseStyle}${filtered};` : baseStyle);
}

/**
 * Splits an element containing `<br>` hard-breaks into independent `<p>` lines
 * while preserving inline formatting tags (colors, highlights, bold, italic, links).
 */
function splitElementAtBreaks(
  sourceEl: HTMLElement,
  doc: Document
): HTMLElement[] {
  const lines: HTMLElement[] = [];
  let currentLine = doc.createElement(
    /^H[1-6]$/.test(sourceEl.tagName) ? sourceEl.tagName : "p"
  );
  const srcStyle = sourceEl.getAttribute("style");
  if (srcStyle) currentLine.setAttribute("style", srcStyle);

  const pushCurrent = () => {
    lines.push(currentLine);
    currentLine = doc.createElement(currentLine.tagName);
    if (srcStyle) currentLine.setAttribute("style", srcStyle);
  };

  function appendIntoLine(
    node: Node,
    ancestorWrappers: HTMLElement[],
    targetLine: HTMLElement
  ) {
    let dest: HTMLElement = targetLine;
    for (const wrapper of ancestorWrappers) {
      const clone = wrapper.cloneNode(false) as HTMLElement;
      dest.appendChild(clone);
      dest = clone;
    }
    dest.appendChild(node);
  }

  function walk(node: Node, wrappers: HTMLElement[]) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as HTMLElement;
        if (el.tagName === "BR") {
          pushCurrent();
          continue;
        }
        if (
          el.tagName === "SPAN" ||
          el.tagName === "STRONG" ||
          el.tagName === "B" ||
          el.tagName === "EM" ||
          el.tagName === "I" ||
          el.tagName === "U" ||
          el.tagName === "S" ||
          el.tagName === "MARK" ||
          el.tagName === "A" ||
          el.tagName === "SUB" ||
          el.tagName === "SUP" ||
          el.tagName === "CODE"
        ) {
          walk(el, [...wrappers, el]);
          continue;
        }
      }
      appendIntoLine(child.cloneNode(true), wrappers, currentLine);
    }
  }

  walk(sourceEl, []);
  lines.push(currentLine);
  return lines;
}

function makeLineUnit(
  el: HTMLElement,
  settings: ServiceSheetSettings
): RenderedUnit | null {
  stripBlockMetadata(el);
  const text = normalizeText(el.textContent || "");

  if (el.tagName === "HR") {
    return {
      kind: "separator",
      html: HR_SEPARATOR_HTML,
      plainText: PLAIN_SEPARATOR,
      estimatedLines: 1
    };
  }

  if (SEPARATOR_TEXT_RE.test(text)) {
    mergeCompactParagraphStyle(el, settings.fontSizePt);
    return {
      kind: "separator",
      html: el.outerHTML,
      plainText: text,
      estimatedLines: 1
    };
  }

  const hasMedia = !!el.querySelector("img,svg,table,video,audio");
  if (!text && !hasMedia) {
    if (settings.removeEmptyLines) return null;
    return {
      kind: "line",
      tagName: "P",
      innerHtml: "&nbsp;",
      html: `<p style="${getWordParagraphStyle(settings.fontSizePt)}">&nbsp;</p>`,
      plainText: "",
      estimatedLines: 1
    };
  }

  mergeCompactParagraphStyle(el, settings.fontSizePt);
  return {
    kind: "line",
    tagName: el.tagName,
    innerHtml: el.innerHTML,
    html: el.outerHTML,
    plainText: text,
    estimatedLines: estimateLinesForText(text, settings)
  };
}

/**
 * Parses arbitrary editor HTML (full note or copied selection fragment) into
 * ordered, spacing-free units preserving inline formatting and separators.
 */
export function parseUnitsFromHtml(
  html: string,
  settings: ServiceSheetSettings
): RenderedUnit[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const units: RenderedUnit[] = [];

  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName;
    if (tag === "HR") {
      units.push({
        kind: "separator",
        html: HR_SEPARATOR_HTML,
        plainText: PLAIN_SEPARATOR,
        estimatedLines: 1
      });
      continue;
    }

    if (tag === "P" || tag === "DIV" || /^H[1-6]$/.test(tag)) {
      const hasContent =
        normalizeText(child.textContent || "").length > 0 ||
        !!child.querySelector("img,svg,table,video,audio");
      const splitLines =
        hasContent && child.querySelector("br")
          ? splitElementAtBreaks(child as HTMLElement, doc)
          : [child.cloneNode(true) as HTMLElement];

      for (const lineEl of splitLines) {
        const unit = makeLineUnit(lineEl, settings);
        if (unit) units.push(unit);
      }
      continue;
    }

    if (tag === "UL" || tag === "OL") {
      const clone = child.cloneNode(true) as HTMLElement;
      stripBlockMetadata(clone);
      clone.setAttribute(
        "style",
        `margin:0;padding-left:16pt;font-family:Calibri,Arial,sans-serif;font-size:${settings.fontSizePt}pt;line-height:1.15;`
      );
      const liPlain: string[] = [];
      for (const li of Array.from(clone.querySelectorAll("li"))) {
        const liText = normalizeText(li.textContent || "");
        if (!liText && settings.removeEmptyLines) {
          li.remove();
          continue;
        }
        liPlain.push(
          tag === "OL" ? `${liPlain.length + 1}. ${liText}` : `• ${liText}`
        );
        for (const p of Array.from(li.querySelectorAll("p"))) {
          mergeCompactParagraphStyle(p, settings.fontSizePt);
        }
      }
      if (liPlain.length === 0) continue;
      units.push({
        kind: "line",
        html: clone.outerHTML,
        plainText: liPlain.join("\n"),
        estimatedLines: liPlain.reduce(
          (sum, line) => sum + estimateLinesForText(line, settings),
          0
        )
      });
      continue;
    }

    const fallback = child.cloneNode(true) as HTMLElement;
    const unit = makeLineUnit(fallback, settings);
    if (unit) units.push(unit);
  }

  return units;
}

/**
 * Groups sequential lines into service entries split on separator rules.
 */
export function groupUnitsIntoServices(units: RenderedUnit[]): ServiceGroup[] {
  const groups: ServiceGroup[] = [];
  let current: RenderedUnit[] = [];

  for (const unit of units) {
    if (unit.kind === "separator") {
      if (current.length > 0) {
        groups.push(buildGroup(current, unit));
        current = [];
      }
      continue;
    }
    current.push(unit);
  }
  if (current.length > 0) {
    groups.push(buildGroup(current));
  }

  return groups;
}

function buildGroup(
  lines: RenderedUnit[],
  separatorAfter?: RenderedUnit
): ServiceGroup {
  const firstText = lines.find((u) => u.plainText.length > 0)?.plainText ?? "";
  return {
    units: lines,
    separatorAfter,
    previewLabel: firstText.slice(0, 48),
    estimatedLines: lines.reduce((sum, u) => sum + u.estimatedLines, 0)
  };
}

function getFallbackLinesPerPage(settings: ServiceSheetSettings): number {
  const { printableHeightMm } = getPageDimensionsMm(settings);
  const lineHeightMm = (settings.fontSizePt * 1.08 * 25.4) / 72;
  return Math.max(20, Math.floor(printableHeightMm / lineHeightMm));
}

/**
 * Joins consecutive plain paragraphs inside a block with `<br />` inside one `<p>`
 * so Microsoft Word never inserts default `8pt` paragraph spacing between lines,
 * even when pasting with Merge Formatting / Use Destination Styles.
 */
function renderUnitsCompactHtml(
  units: RenderedUnit[],
  settings: ServiceSheetSettings
): string {
  const out: string[] = [];
  let bufferedParagraphLines: string[] = [];

  const flushParagraphs = () => {
    if (bufferedParagraphLines.length === 0) return;
    out.push(
      `<p style="${getWordParagraphStyle(settings.fontSizePt)}">${bufferedParagraphLines.join("<br />")}</p>`
    );
    bufferedParagraphLines = [];
  };

  for (const unit of units) {
    if (
      unit.kind === "line" &&
      (unit.tagName === "P" || unit.tagName === "DIV") &&
      unit.innerHtml !== undefined
    ) {
      bufferedParagraphLines.push(unit.innerHtml);
    } else {
      flushParagraphs();
      out.push(unit.html);
    }
  }
  flushParagraphs();
  return out.join("");
}

function renderGroupsHtml(
  groups: ServiceGroup[],
  settings: ServiceSheetSettings,
  forceSeparatorHtml?: string
): string {
  return groups
    .map((group, idx) => {
      const content = renderUnitsCompactHtml(group.units, settings);
      if (idx === groups.length - 1) return content;
      const sep = forceSeparatorHtml ?? group.separatorAfter?.html ?? HR_SEPARATOR_HTML;
      return content + sep;
    })
    .join("");
}

function renderGroupsPlainText(groups: ServiceGroup[]): string {
  return groups
    .map((group, idx) => {
      const content = group.units.map((u) => u.plainText).join("\n");
      if (idx === groups.length - 1) return content;
      const sep = group.separatorAfter?.plainText ?? PLAIN_SEPARATOR;
      return `${content}\n${sep}\n`;
    })
    .join("");
}

function wrapWordHtml(bodyHtml: string, settings: ServiceSheetSettings): string {
  // Never emit manual <!--StartFragment--> markers: Chromium ClipboardItem adds
  // CF_HTML fragment markers automatically, and nested markers cause Word to reject HTML.
  return (
    `<div style="font-family:Calibri,Arial,sans-serif;` +
    `font-size:${settings.fontSizePt}pt;line-height:1.08;color:#000000;margin:0;padding:0;">` +
    `${bodyHtml}</div>`
  );
}

function wrapPrintHtml(
  title: string,
  bodyHtml: string,
  settings: ServiceSheetSettings
): string {
  const { marginTopBottomMm, marginLeftRightMm } =
    getPageDimensionsMm(settings);
  const printPadTopBottomMm = settings.mode === "a4" ? marginTopBottomMm : 20;
  const printPadLeftRightMm = settings.mode === "a4" ? marginLeftRightMm : 25;
  const escapedTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapedTitle}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      font-size: ${settings.fontSizePt}pt;
      line-height: 1.22;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      padding: ${printPadTopBottomMm}mm ${printPadLeftRightMm}mm;
      box-sizing: border-box;
    }
    p, div, h1, h2, h3, h4, h5, h6 {
      margin: 0 !important;
      padding: 0 !important;
      line-height: 1.22 !important;
    }
    hr {
      border: none !important;
      border-top: 1px solid #666666 !important;
      margin: 6pt 0 !important;
      padding: 0 !important;
      height: 0 !important;
    }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;
}

function measureFitsInRealA4Box(
  htmlSnippet: string,
  settings: ServiceSheetSettings
): boolean | null {
  if (typeof document === "undefined" || !document.body) return null;

  const { printableWidthMm, printableHeightMm } =
    getPageDimensionsMm(settings);
  const host = document.createElement("div");
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;` +
    `width:${printableWidthMm}mm;height:${printableHeightMm}mm;overflow:visible;` +
    `font-family:Calibri,Arial,sans-serif;font-size:${settings.fontSizePt}pt;` +
    `line-height:1.08;margin:0;padding:0;box-sizing:border-box;`;

  const inner = document.createElement("div");
  inner.innerHTML = htmlSnippet;
  // Microsoft Word renders <hr> dividers significantly taller (~14-16pt total) than 1px CSS borders.
  if (settings.mode === "word") {
    for (const hr of Array.from(inner.querySelectorAll("hr"))) {
      hr.style.marginTop = "5pt";
      hr.style.marginBottom = "5pt";
    }
  }
  host.appendChild(inner);
  document.body.appendChild(host);

  try {
    const targetHeight = host.getBoundingClientRect().height;
    const contentHeight = inner.getBoundingClientRect().height;
    if (targetHeight <= 10 || contentHeight <= 0) return null;
    return contentHeight <= targetHeight;
  } finally {
    host.remove();
  }
}

function hasSeparators(units: RenderedUnit[]): boolean {
  return units.some((u) => u.kind === "separator");
}

/**
 * Packs units or whole service blocks from the bottom of the document upwards
 * while preserving chronological order until filling 1 page or `maxLines`.
 */
export function packBottomToFit(
  html: string,
  settings: ServiceSheetSettings,
  title = "NookLab Service Sheet"
): PackResult {
  const units = parseUnitsFromHtml(html, settings);
  if (units.length === 0) {
    return {
      wordHtml: "",
      printHtml: wrapPrintHtml(title, "", settings),
      plainText: "",
      groupCount: 0,
      lineCount: 0,
      estimatedLines: 0,
      firstLinePreview: "",
      lastLinePreview: ""
    };
  }

  let groups = groupUnitsIntoServices(units);
  const useWholeServiceBlocks =
    settings.wholeBlocksOnly && groups.length > 1 && hasSeparators(units);

  if (!useWholeServiceBlocks) {
    groups = units.map((u) => buildGroup([u]));
  }

  const maxLineBudget =
    settings.mode === "lines"
      ? settings.maxLines
      : getFallbackLinesPerPage(settings);

  const selected: ServiceGroup[] = [];
  let runningLines = 0;

  for (let i = groups.length - 1; i >= 0; i--) {
    const candidate = groups[i];
    const sepLines =
      selected.length > 0 && useWholeServiceBlocks
        ? settings.mode === "word"
          ? 2
          : 1
        : 0;
    const nextList = [candidate, ...selected];

    if (settings.mode === "word" || settings.mode === "a4") {
      const candidateHtml = useWholeServiceBlocks
        ? renderGroupsHtml(nextList, settings)
        : renderUnitsCompactHtml(
            nextList.flatMap((g) => g.units),
            settings
          );
      const fitsDom = measureFitsInRealA4Box(candidateHtml, settings);
      if (fitsDom !== null) {
        if (fitsDom || selected.length === 0) {
          selected.unshift(candidate);
          runningLines += candidate.estimatedLines + sepLines;
          continue;
        }
        break;
      }
    }

    if (
      runningLines + sepLines + candidate.estimatedLines <= maxLineBudget ||
      selected.length === 0
    ) {
      selected.unshift(candidate);
      runningLines += candidate.estimatedLines + sepLines;
    } else {
      break;
    }
  }

  while (
    !useWholeServiceBlocks &&
    selected[0]?.units[0]?.kind === "separator"
  ) {
    selected.shift();
  }

  const bodyHtml = useWholeServiceBlocks
    ? renderGroupsHtml(selected, settings)
    : renderUnitsCompactHtml(
        selected.flatMap((g) => g.units),
        settings
      );
  const printBodyHtml = useWholeServiceBlocks
    ? renderGroupsHtml(selected, settings, PRINT_SEPARATOR_HTML)
    : renderUnitsCompactHtml(
        selected.flatMap((g) =>
          g.units.map((u) =>
            u.kind === "separator" ? { ...u, html: PRINT_SEPARATOR_HTML } : u
          )
        ),
        settings
      );
  const plainText = useWholeServiceBlocks
    ? renderGroupsPlainText(selected)
    : selected.map((g) => g.units.map((u) => u.plainText).join("\n")).join("\n");

  const lineCount = selected.reduce((sum, g) => sum + g.units.length, 0);
  const firstUnit = selected[0]?.units.find((u) => u.plainText.length > 0);
  const lastGroup = selected[selected.length - 1];
  const lastUnit = lastGroup?.units
    .slice()
    .reverse()
    .find((u) => u.plainText.length > 0);

  return {
    wordHtml: wrapWordHtml(bodyHtml, settings),
    printHtml: wrapPrintHtml(title, printBodyHtml, settings),
    plainText,
    groupCount: useWholeServiceBlocks ? selected.length : 1,
    lineCount,
    estimatedLines: runningLines,
    firstLinePreview: firstUnit?.plainText.slice(0, 44) ?? "",
    lastLinePreview: lastUnit?.plainText.slice(0, 44) ?? ""
  };
}

/**
 * Strips double spacing and blank spacer paragraphs from any HTML fragment.
 */
export function cleanHtmlWithoutSpacing(
  html: string,
  settings: ServiceSheetSettings
): { wordHtml: string; plainText: string; lineCount: number } {
  const units = parseUnitsFromHtml(html, settings);
  while (units[0]?.kind === "separator") units.shift();
  while (units[units.length - 1]?.kind === "separator") units.pop();

  const bodyHtml = renderUnitsCompactHtml(units, settings);
  const plainText = units.map((u) => u.plainText).join("\n");
  return {
    wordHtml: wrapWordHtml(bodyHtml, settings),
    plainText,
    lineCount: units.length
  };
}
