/*
 * Generate gzipped lexicon & synced engine/sheet helpers for editor-mobile from
 * the single-source implementations in apps/web/src/common/.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, "..");
const webCommon = path.resolve(pkgRoot, "../../apps/web/src/common");
const outDir = path.join(pkgRoot, "src/common");

fs.mkdirSync(outDir, { recursive: true });

// 1. Gzipped PT-PT + EN lexicon module (works offline under file:// in Android WebView)
const lexiconPath = path.join(webCommon, "nooklab-autocorrect-lexicon.txt");
const lexiconBuf = fs.readFileSync(lexiconPath);
const gzipB64 = zlib.gzipSync(lexiconBuf, { level: 9 }).toString("base64");
fs.writeFileSync(
  path.join(outDir, "nooklab-lexicon.generated.ts"),
  `/* eslint-disable */\n// Auto-generated from apps/web/src/common/nooklab-autocorrect-lexicon.txt\nexport const NOOKLAB_LEXICON_GZIP_B64 = "${gzipB64}";\n`
);

// 2. Shared autocorrect engine (pure TypedArray implementation, zero deps)
const engineSrc = fs.readFileSync(
  path.join(webCommon, "nooklab-autocorrect-engine.ts"),
  "utf8"
);
fs.writeFileSync(
  path.join(outDir, "nooklab-autocorrect-engine.generated.ts"),
  `/* eslint-disable */\n// Auto-generated from apps/web/src/common/nooklab-autocorrect-engine.ts\n${engineSrc}`
);

// 3. Shared service-sheet core (swap web Config import for localStorage shim)
const sheetSrc = fs.readFileSync(
  path.join(webCommon, "nooklab-service-sheet-core.ts"),
  "utf8"
);
const localStorageShim = `const Config = {
  get<T>(key: string, def: T): T {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return raw ? (JSON.parse(raw) as T) : def;
    } catch {
      return def;
    }
  },
  set(key: string, val: unknown): void {
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(val));
    } catch {
      /* ignore */
    }
  }
};`;
fs.writeFileSync(
  path.join(outDir, "nooklab-service-sheet-core.generated.ts"),
  `/* eslint-disable */\n// Auto-generated from apps/web/src/common/nooklab-service-sheet-core.ts\n${sheetSrc.replace(
    'import Config from "../utils/config";',
    localStorageShim
  )}`
);

console.log(
  `Synced NookLab mobile assets (gzipped lexicon ${(gzipB64.length / 1024).toFixed(
    1
  )} KB base64).`
);
