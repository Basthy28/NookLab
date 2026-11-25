/*
 * NookLab — background Web Worker running the bilingual autocorrect engine
 * so lexicon parsing and candidate ranking stay off the editor UI thread.
 */
import { NookLabAutocorrectEngine } from "./nooklab-autocorrect-engine";
import lexiconRaw from "./nooklab-autocorrect-lexicon.txt?raw";

export type AutocorrectWorkerRequest =
  | { type: "init"; ignoredWords: string[] }
  | { type: "ignore"; word: string }
  | { type: "check"; id: number; token: string; prevWord: string };

export type AutocorrectWorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; replacement: string | null };

let engine: NookLabAutocorrectEngine | null = null;
let pendingIgnored: string[] = [];

function getEngine(): NookLabAutocorrectEngine {
  if (!engine) {
    engine = new NookLabAutocorrectEngine(lexiconRaw, pendingIgnored);
  }
  return engine;
}

self.addEventListener(
  "message",
  (event: MessageEvent<AutocorrectWorkerRequest>) => {
    const msg = event.data;
    if (msg.type === "init") {
      pendingIgnored = msg.ignoredWords;
      getEngine().setIgnoredWords(pendingIgnored);
      const res: AutocorrectWorkerResponse = { type: "ready" };
      self.postMessage(res);
      return;
    }

    if (msg.type === "ignore") {
      if (!pendingIgnored.includes(msg.word)) pendingIgnored.push(msg.word);
      engine?.addIgnoredWord(msg.word);
      return;
    }

    if (msg.type === "check") {
      const replacement = getEngine().checkWord(msg.token, msg.prevWord);
      const res: AutocorrectWorkerResponse = {
        type: "result",
        id: msg.id,
        replacement
      };
      self.postMessage(res);
    }
  }
);
