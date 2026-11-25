/*
 * NookLab — mobile-friendly bilingual (pt-PT + EN) autocorrect engine.
 *
 * Uses compact TypedArray open-addressed multi-value hash tables instead of
 * string-keyed JS Maps for SymSpell deletes and phonetic buckets so memory
 * stays small (~30 MB) on mobile browsers and lookups finish in < 1 ms.
 */

const ADJACENT_KEYS: Record<string, string> = {
  q: "was",
  w: "qesad",
  e: "wrdf",
  r: "etfg",
  t: "rygh",
  y: "tuhj",
  u: "yijk",
  i: "uokl",
  o: "ipl",
  p: "ol",
  a: "qwsz",
  s: "qwedazx",
  d: "wersfxc",
  f: "ertdgcv",
  g: "rtyfhvb",
  h: "tyugjbn",
  j: "yuihknm",
  k: "uiojlm",
  l: "iopk",
  z: "asx",
  x: "zsdc",
  c: "xdfv",
  v: "cfgb",
  b: "vghn",
  n: "bhjm",
  m: "njk"
};

// High-confidence homograph diacritic disambiguation conditioned on preceding word.
const CONTEXT_ACCENTS = new Map<string, string>([
  ["a|maquina", "máquina"],
  ["da|maquina", "máquina"],
  ["na|maquina", "máquina"],
  ["uma|maquina", "máquina"],
  ["esta|maquina", "máquina"],
  ["essa|maquina", "máquina"],
  ["aquela|maquina", "máquina"],
  ["pela|maquina", "máquina"],
  ["com|maquina", "máquina"],
  ["sem|maquina", "máquina"],
  ["o|modulo", "módulo"],
  ["do|modulo", "módulo"],
  ["no|modulo", "módulo"],
  ["um|modulo", "módulo"],
  ["este|modulo", "módulo"],
  ["esse|modulo", "módulo"],
  ["aquele|modulo", "módulo"],
  ["pelo|modulo", "módulo"],
  ["ate|amanha", "amanhã"],
  ["para|amanha", "amanhã"],
  ["de|amanha", "amanhã"],
  ["desde|amanha", "amanhã"],
  ["ca|amanha", "amanhã"],
  ["pela|amanha", "amanhã"],
  ["volto|ca", "cá"],
  ["por|ca", "cá"],
  ["ate|ca", "cá"],
  ["para|ca", "cá"],
  ["de|ca", "cá"],
  ["vem|ca", "cá"],
  ["esta|ca", "cá"],
  ["estou|ca", "cá"],
  ["fica|ca", "cá"],
  ["fiquei|ca", "cá"],
  ["o|tecnico", "técnico"],
  ["do|tecnico", "técnico"],
  ["no|tecnico", "técnico"],
  ["um|tecnico", "técnico"],
  ["ao|tecnico", "técnico"],
  ["o|numero", "número"],
  ["do|numero", "número"],
  ["no|numero", "número"],
  ["um|numero", "número"],
  ["ao|numero", "número"],
  ["em|inicio", "início"],
  ["no|inicio", "início"],
  ["do|inicio", "início"],
  ["ao|inicio", "início"],
  ["a|fabrica", "fábrica"],
  ["da|fabrica", "fábrica"],
  ["na|fabrica", "fábrica"],
  ["pela|fabrica", "fábrica"],
  ["uma|fabrica", "fábrica"],
  ["o|publico", "público"],
  ["do|publico", "público"],
  ["no|publico", "público"],
  ["ao|publico", "público"],
  ["sem|duvida", "dúvida"],
  ["a|duvida", "dúvida"],
  ["na|duvida", "dúvida"],
  ["em|duvida", "dúvida"],
  ["a|copia", "cópia"],
  ["da|copia", "cópia"],
  ["uma|copia", "cópia"],
  ["o|calculo", "cálculo"],
  ["do|calculo", "cálculo"],
  ["um|calculo", "cálculo"]
]);

// Ultra-safe shortcuts whose unaccented/mistyped form is essentially never intended verbatim.
const UNAMBIGUOUS_SHORT = new Map<string, string>([
  ["nao", "não"],
  ["ja", "já"],
  ["tambem", "também"],
  ["entao", "então"],
  ["amanha", "amanhã"],
  ["teh", "the"]
]);

const CLITIC_PRONOUNS =
  /^(te|me|se|lo|la|los|las|no|na|nos|nas|lhe|lhes|vos)$/i;

export function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ptPhoneticKey(word: string): string {
  let w = stripAccents(word.toLowerCase());
  w = w.replace(/([a-z])\1+/g, "$1");
  w = w.replace(/^h/, "");
  w = w.replace(/^[ie]/, "e");
  w = w.replace(/sc|xc|ç/g, "s");
  w = w.replace(/c([ei])/g, "s$1");
  w = w.replace(/g([ei])/g, "j$1");
  w = w.replace(/ch/g, "x");
  w = w.replace(/ph/g, "f");
  w = w.replace(/qu|ck/g, "k").replace(/c/g, "k");
  w = w.replace(/z/g, "s");
  w = w.replace(/y/g, "i").replace(/w/g, "v");
  w = w.replace(/([a-z])\1+/g, "$1");
  return w;
}

export function matchCase(original: string, target: string): string {
  if (!original || !target) return target;
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return target[0].toUpperCase() + target.slice(1);
  }
  return target;
}

function fnv1a32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

class CompactHashIndex {
  private readonly mask: number;
  private readonly heads: Int32Array;
  private readonly hashes: Uint32Array;
  private readonly wids: Int32Array;
  private readonly next: Int32Array;
  private len = 0;

  constructor(bucketPow2: number, maxEntries: number) {
    this.mask = (1 << bucketPow2) - 1;
    this.heads = new Int32Array(1 << bucketPow2).fill(-1);
    this.hashes = new Uint32Array(maxEntries);
    this.wids = new Int32Array(maxEntries);
    this.next = new Int32Array(maxEntries);
  }

  add(key: string, wid: number) {
    const h = fnv1a32(key);
    const b = h & this.mask;
    let cur = this.heads[b];
    let chainSame = 0;
    while (cur !== -1) {
      if (this.hashes[cur] === h) {
        if (this.wids[cur] === wid) return;
        chainSame++;
        if (chainSame >= 10) return;
      }
      cur = this.next[cur];
    }
    const idx = this.len;
    if (idx >= this.hashes.length) return;
    this.len = idx + 1;
    this.hashes[idx] = h;
    this.wids[idx] = wid;
    this.next[idx] = this.heads[b];
    this.heads[b] = idx;
  }

  collect(key: string, outSet: Set<number>) {
    const h = fnv1a32(key);
    let cur = this.heads[h & this.mask];
    while (cur !== -1) {
      if (this.hashes[cur] === h) outSet.add(this.wids[cur]);
      cur = this.next[cur];
    }
  }
}

function weightedDamerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  const rowWidth = lb + 1;
  const d = new Float32Array((la + 1) * rowWidth);
  for (let i = 0; i <= la; i++) d[i * rowWidth] = i;
  for (let j = 0; j <= lb; j++) d[j] = j;

  for (let i = 1; i <= la; i++) {
    const ca = a[i - 1];
    const na = stripAccents(ca);
    const adj = ADJACENT_KEYS[na];
    const row = i * rowWidth;
    const prevRow = (i - 1) * rowWidth;
    for (let j = 1; j <= lb; j++) {
      const cb = b[j - 1];
      const nb = stripAccents(cb);
      const cost =
        ca === cb
          ? 0
          : na === nb
          ? 0.12
          : adj && adj.includes(nb)
          ? 0.65
          : 1.0;

      let val = Math.min(
        d[prevRow + j] + 1,
        d[row + j - 1] + 1,
        d[prevRow + j - 1] + cost
      );

      if (i > 1 && j > 1 && ca === b[j - 2] && a[i - 2] === cb) {
        val = Math.min(val, d[(i - 2) * rowWidth + (j - 2)] + 0.55);
      }
      d[row + j] = val;
    }
  }
  return d[la * rowWidth + lb];
}

export type WordCandidateContext = {
  token: string;
  prevWord: string;
  wordOffset: number;
};

/**
 * Extracts the trailing alphabetic word at the end of `textBeforeWordEnd`
 * along with its immediate preceding word (for homograph disambiguation),
 * returning null for codes, URLs, emails, paths, hashtags, or hyphenated clitics.
 */
export function extractTrailingWordCandidate(
  textBeforeWordEnd: string
): WordCandidateContext | null {
  const match = /[A-Za-zÀ-ÿ]+$/.exec(textBeforeWordEnd);
  if (!match) return null;

  const token = match[0];
  const wordOffset = match.index;
  const charBefore = wordOffset > 0 ? textBeforeWordEnd[wordOffset - 1] : "";

  if (charBefore && /[\d@/.\\:_#]/.test(charBefore)) {
    return null;
  }
  if (charBefore === "-" && token.length <= 4 && CLITIC_PRONOUNS.test(token)) {
    return null;
  }

  let prevWord = "";
  const prefix = textBeforeWordEnd.slice(0, wordOffset);
  if (!/[.!?\n]\s*$/.test(prefix)) {
    const prevMatch = /([A-Za-zÀ-ÿ]+)[\s"'“”‘’(\[]*$/.exec(prefix);
    if (prevMatch) {
      prevWord = prevMatch[1];
    }
  }

  return { token, prevWord, wordOffset };
}

export class NookLabAutocorrectEngine {
  private readonly words: string[];
  private readonly freqs: Uint32Array;
  private readonly exactSet = new Set<string>();
  private readonly stripMap = new Map<string, number>();
  private readonly properSet = new Set<string>();
  private readonly delIdx: CompactHashIndex;
  private readonly phonIdx: CompactHashIndex;
  private readonly ignoredWords = new Set<string>();

  constructor(lexiconRaw: string, initialIgnored: string[] = []) {
    for (const w of initialIgnored) {
      if (w) this.ignoredWords.add(w.toLowerCase());
    }

    const lines = lexiconRaw.split(/\r?\n/);
    const exactMarker = lines.indexOf("#EXACT");
    const properMarker = lines.indexOf("#PROPER");
    const wordLineCount =
      exactMarker !== -1
        ? exactMarker
        : properMarker !== -1
        ? properMarker
        : lines.length;

    const words: string[] = [];
    const freqs: number[] = [];

    for (let i = 0; i < wordLineCount; i++) {
      const line = lines[i];
      if (!line) continue;
      const tab = line.indexOf("\t");
      if (tab <= 0) continue;
      const w = line.slice(0, tab);
      const f = parseInt(line.slice(tab + 1), 36) || 1;
      words.push(w);
      freqs.push(f);
    }

    if (exactMarker !== -1) {
      const exactEnd = properMarker !== -1 ? properMarker : lines.length;
      for (let i = exactMarker + 1; i < exactEnd; i++) {
        const w = lines[i].trim();
        if (w) this.exactSet.add(w);
      }
    }

    if (properMarker !== -1) {
      for (let i = properMarker + 1; i < lines.length; i++) {
        const p = lines[i].trim().toLowerCase();
        if (p) this.properSet.add(p);
      }
    }

    this.words = words;
    this.freqs = new Uint32Array(freqs);
    this.delIdx = new CompactHashIndex(20, 1_100_000);
    this.phonIdx = new CompactHashIndex(17, 120_000);

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      this.exactSet.add(w);
      const norm = stripAccents(w).replace(/ç/g, "c");
      if (norm !== w && !this.stripMap.has(norm)) {
        this.stripMap.set(norm, i);
      }

      if (i < 80_000) {
        this.phonIdx.add(ptPhoneticKey(w), i);
      }

      if (i < 75_000 && norm.length >= 3 && norm.length <= 20) {
        this.delIdx.add(norm, i);
        const d1s: string[] = [];
        for (let a = 0; a < norm.length; a++) {
          const d1 = norm.slice(0, a) + norm.slice(a + 1);
          d1s.push(d1);
          this.delIdx.add(d1, i);
        }
        if (i < 12_000 && norm.length >= 4 && norm.length <= 14) {
          for (const d1 of d1s) {
            for (let b = 0; b < d1.length; b++) {
              this.delIdx.add(d1.slice(0, b) + d1.slice(b + 1), i);
            }
          }
        }
      }
    }
  }

  addIgnoredWord(word: string) {
    const clean = word.trim().toLowerCase();
    if (clean) this.ignoredWords.add(clean);
  }

  setIgnoredWords(words: string[]) {
    this.ignoredWords.clear();
    for (const w of words) {
      const clean = w.trim().toLowerCase();
      if (clean) this.ignoredWords.add(clean);
    }
  }

  checkWord(token: string, prevWord = ""): string | null {
    if (!token) return null;
    if (/\d/.test(token)) return null;

    const low = token.toLowerCase();
    // Skip ALL-CAPS acronyms and codes (MSR, MLR, LG, TV, HDMI).
    if (token.length >= 2 && token === token.toUpperCase() && token !== low) {
      return null;
    }
    if (this.ignoredWords.has(low) || this.properSet.has(low)) {
      return null;
    }

    const isCapitalized = token[0] !== low[0];
    // Protect mid-sentence unknown capitalized words unless context/unambiguous/diacritic.
    const prevNorm = stripAccents(prevWord.toLowerCase());
    if (prevNorm) {
      const ctxHit = CONTEXT_ACCENTS.get(`${prevNorm}|${low}`);
      if (ctxHit) return matchCase(token, ctxHit);
    }

    const shortHit = UNAMBIGUOUS_SHORT.get(low);
    if (shortHit) return matchCase(token, shortHit);

    if (token.length < 3 || this.exactSet.has(low)) return null;

    const norm = stripAccents(low).replace(/ç/g, "c");
    const normHit = this.stripMap.get(norm);
    if (normHit !== undefined && this.words[normHit] !== low) {
      return matchCase(token, this.words[normHit]);
    }

    // Do not heuristically rewrite mid-sentence capitalized proper names/brands.
    if (isCapitalized && prevWord !== "") {
      return null;
    }

    const safeCollapse = norm
      .replace(/([bcdfghjklmnpqtvwxz])\1+/g, "$1")
      .replace(/([aeiou])\1{2,}/g, "$1");
    if (safeCollapse !== norm) {
      if (this.exactSet.has(safeCollapse)) {
        return matchCase(token, safeCollapse);
      }
      const collHit = this.stripMap.get(safeCollapse);
      if (collHit !== undefined) {
        return matchCase(token, this.words[collHit]);
      }
    }

    // Do not strip regular -s/-es plurals when the singular stem is valid (e.g. papoilas).
    if (
      low.length >= 4 &&
      low.endsWith("s") &&
      (this.exactSet.has(low.slice(0, -1)) ||
        (low.endsWith("es") && this.exactSet.has(low.slice(0, -2))))
    ) {
      return null;
    }

    const candidates = new Set<number>();
    this.delIdx.collect(norm, candidates);
    const qPhon = ptPhoneticKey(low);
    this.phonIdx.collect(qPhon, candidates);

    const d1s: string[] = [];
    for (let a = 0; a < norm.length; a++) {
      const d1 = norm.slice(0, a) + norm.slice(a + 1);
      d1s.push(d1);
      this.delIdx.collect(d1, candidates);
    }
    if (norm.length >= 4) {
      for (const d1 of d1s) {
        for (let b = 0; b < d1.length; b++) {
          this.delIdx.collect(d1.slice(0, b) + d1.slice(b + 1), candidates);
        }
      }
    }

    let bestWord: string | null = null;
    let bestScore = Infinity;
    let bestFreq = 0;
    let bestDl = Infinity;
    let bestSamePhon = false;

    for (const id of candidates) {
      const cw = this.words[id];
      if (Math.abs(cw.length - low.length) > 3) continue;
      const dl = weightedDamerauLevenshtein(low, cw);
      const samePhon = ptPhoneticKey(cw) === qPhon;
      if (dl > 2.65 && !samePhon) continue;

      const phonBonus = samePhon ? -0.9 : 0;
      const freq = this.freqs[id];
      const fBonus = -0.075 * Math.log10(freq + 1);
      const score = dl * 1.45 + phonBonus + fBonus;
      if (score < bestScore) {
        bestScore = score;
        bestWord = cw;
        bestFreq = freq;
        bestDl = dl;
        bestSamePhon = samePhon;
      }
    }

    if (!bestWord) return null;
    // Never rewrite capitalized place/street names unless phonetically identical.
    if (isCapitalized && !bestSamePhon) {
      return null;
    }
    // Avoid overwriting obscure/regional words via distant non-phonetic substitutions.
    if (!bestSamePhon && bestWord.length === low.length && bestDl >= 0.95 && bestFreq < 250) {
      return null;
    }
    return bestScore <= 3.1 ? matchCase(token, bestWord) : null;
  }
}
