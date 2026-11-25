/*
 * NookLab — unit tests for bilingual (pt-PT + EN) autocorrect engine and
 * editor update/revert hooks.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  extractTrailingWordCandidate,
  NookLabAutocorrectEngine
} from "../src/common/nooklab-autocorrect-engine";
import {
  handleAutocorrectKeyDown,
  handleAutocorrectUpdate,
  isAutocorrectEnabled,
  setAutocorrectEnabled,
  setAutocorrectFallbackEngineForTesting
} from "../src/common/nooklab-autocorrect";

const LEXICON_PATH = path.resolve(
  __dirname,
  "../src/common/nooklab-autocorrect-lexicon.txt"
);

describe("NookLabAutocorrectEngine", () => {
  let engine: NookLabAutocorrectEngine;

  beforeAll(() => {
    const raw = readFileSync(LEXICON_PATH, "utf8");
    engine = new NookLabAutocorrectEngine(raw);
  });

  it("fixes aggressive European Portuguese typos and missing diacritics", () => {
    const cases: Array<[string, string, string]> = [
      ["paulda", "", "paulada"],
      ["portta", "", "porta"],
      ["telefonn", "", "telefone"],
      ["isclaresimento", "", "esclarecimento"],
      ["informaçao", "", "informação"],
      ["informacao", "", "informação"],
      ["frigorifico", "", "frigorífico"],
      ["maquina", "a", "máquina"],
      ["modulo", "o", "módulo"],
      ["ca", "volto", "cá"],
      ["eletrodomestico", "", "eletrodoméstico"],
      ["orcamento", "", "orçamento"],
      ["assistencia", "", "assistência"],
      ["telemovel", "", "telemóvel"],
      ["configuracao", "", "configuração"],
      ["substituicao", "", "substituição"],
      ["obrigdo", "", "obrigado"],
      ["nao", "", "não"],
      ["amanha", "", "amanhã"],
      ["tambem", "", "também"],
      ["fasendo", "", "fazendo"]
    ];

    for (const [token, prev, expected] of cases) {
      expect(
        engine.checkWord(token, prev),
        `Failed for "${token}" (prev="${prev}")`
      ).toBe(expected);
    }
  });

  it("preserves initial capitalization on sentence starts and unambiguous diacritics", () => {
    expect(engine.checkWord("Portta", "")).toBe("Porta");
    expect(engine.checkWord("Isclaresimento", "")).toBe("Esclarecimento");
    expect(engine.checkWord("Informaçao", "dar")).toBe("Informação");
    expect(engine.checkWord("Nao", "")).toBe("Não");
  });

  it("fixes English typos in mixed bilingual notes", () => {
    expect(engine.checkWord("recieve", "")).toBe("receive");
    expect(engine.checkWord("seperate", "")).toBe("separate");
    expect(engine.checkWord("definatly", "")).toBe("definitely");
    expect(engine.checkWord("teh", "")).toBe("the");
  });

  it("leaves valid words, codes, acronyms, brands, and Portuguese names untouched", () => {
    const untouched: Array<[string, string]> = [
      ["substitui", "ele"],
      ["consertar", "vai"],
      ["para", "ir"],
      ["esta", "com"],
      ["pais", "os"],
      ["MSR", "Ver"],
      ["MLR", ""],
      ["LG", "MLR"],
      ["F4WN408N0", "LG"],
      ["220V", ""],
      ["10kg", ""],
      ["Carla", ""],
      ["Carla", "14417"],
      ["Paula", ""],
      ["Marques", "Carla"],
      ["Palmela", "em"],
      ["Ariston", ""],
      ["Ariston", "MSR"],
      ["Indesit", ""],
      ["Bosch", ""],
      ["Zanussi", ""],
      ["Valdera", ""],
      ["Aceiro", ""],
      ["papoilas", "das"],
      ["arraiados", "dos"],
      ["cruzeta", "da"],
      ["Cabanas", ""]
    ];

    for (const [token, prev] of untouched) {
      expect(
        engine.checkWord(token, prev),
        `Should stay untouched: "${token}" (prev="${prev}")`
      ).toBeNull();
    }
  });

  it("stops correcting words explicitly added to the ignore list", () => {
    const localEngine = new NookLabAutocorrectEngine(
      readFileSync(LEXICON_PATH, "utf8")
    );
    expect(localEngine.checkWord("paulda", "")).toBe("paulada");
    localEngine.addIgnoredWord("paulda");
    expect(localEngine.checkWord("paulda", "")).toBeNull();
  });

  it("extracts trailing words while skipping URLs, emails, paths, and short clitics", () => {
    expect(extractTrailingWordCandidate("a portta")).toEqual({
      token: "portta",
      prevWord: "a",
      wordOffset: 2
    });
    expect(extractTrailingWordCandidate("segunda-feirra")).toEqual({
      token: "feirra",
      prevWord: "",
      wordOffset: 8
    });
    expect(extractTrailingWordCandidate("ligar-te")).toBeNull();
    expect(extractTrailingWordCandidate("cliente@sapo")).toBeNull();
    expect(extractTrailingWordCandidate("nooklab.duckdns")).toBeNull();
    expect(extractTrailingWordCandidate("/var/www")).toBeNull();
    expect(extractTrailingWordCandidate("#portta")).toBeNull();
  });
});

describe("nooklab-autocorrect editor hooks", () => {
  type FakeDoc = {
    text: string;
    marks?: string[];
    nodeType?: string;
    cursorOffset?: number;
    prevParagraphText?: string;
  };

  function makeEditorHarness(initial: FakeDoc) {
    let docText = initial.text;
    let cursor = initial.cursorOffset ?? docText.length;
    const prevBlockText = initial.prevParagraphText;
    const dispatches: Array<{ from: number; to: number; text: string }> = [];

    const makeTextNode = (t: string) => ({
      isText: true,
      text: t,
      nodeSize: t.length
    });

    const view = {
      isDestroyed: false,
      editable: true,
      composing: false,
      get state() {
        const textNode = makeTextNode(docText);
        const currentBlock = {
          type: { name: initial.nodeType ?? "paragraph" },
          isTextblock: true,
          content: { size: docText.length },
          childCount: docText.length > 0 ? 1 : 0,
          child: () => textNode,
          textBetween: (from: number, to: number) => docText.slice(from, to)
        };
        const prevBlock = prevBlockText
          ? {
              type: { name: "paragraph" },
              isTextblock: true,
              nodeSize: prevBlockText.length + 2,
              content: { size: prevBlockText.length },
              childCount: 1,
              child: () => makeTextNode(prevBlockText)
            }
          : null;

        return {
          selection: { empty: true, from: cursor },
          schema: { text: (s: string, marks: unknown) => ({ text: s, marks }) },
          doc: {
            content: {
              size: (prevBlock ? prevBlock.nodeSize : 0) + docText.length + 2
            },
            textBetween: (from: number, to: number) => {
              if (prevBlock && to <= prevBlock.nodeSize) {
                return prevBlockText!.slice(from - 1, to - 1);
              }
              return docText.slice(from - 1, to - 1);
            },
            resolve: (pos: number) => {
              const prevSize = prevBlock ? prevBlock.nodeSize : 0;
              return {
                parent: currentBlock,
                parentOffset: Math.max(0, pos - prevSize - 1),
                depth: 1,
                before: () => prevSize,
                index: () => (prevBlock ? 1 : 0),
                node: () => ({ child: () => prevBlock }),
                marks: () =>
                  (initial.marks ?? []).map((name) => ({ type: { name } }))
              };
            }
          },
          tr: {
            replaceWith(from: number, to: number, node: { text: string }) {
              return {
                from,
                to,
                node,
                meta: {} as Record<string, unknown>,
                setMeta(k: string, v: unknown) {
                  this.meta[k] = v;
                  return this;
                }
              };
            }
          }
        };
      },
      dispatch(tr: { from: number; to: number; node: { text: string } }) {
        dispatches.push({ from: tr.from, to: tr.to, text: tr.node.text });
        if (prevBlockText && tr.to <= prevBlockText.length + 1) {
          return;
        }
        const localFrom = tr.from - 1;
        const localTo = tr.to - 1;
        const delta = tr.node.text.length - (localTo - localFrom);
        docText = docText.slice(0, localFrom) + tr.node.text + docText.slice(localTo);
        cursor += delta;
      }
    };

    const editor = {
      isEditable: true,
      view,
      get state() {
        return view.state;
      }
    };

    return {
      editor,
      view,
      dispatches,
      getDocText: () => docText,
      getCursor: () => cursor,
      setCursor: (next: number) => {
        cursor = next;
      }
    };
  }

  it("applies space-triggered corrections and reverts via Ctrl+Z and Backspace", () => {
    const raw = readFileSync(LEXICON_PATH, "utf8");
    const engine = new NookLabAutocorrectEngine(raw);
    setAutocorrectFallbackEngineForTesting(engine);
    setAutocorrectEnabled(true);
    expect(isAutocorrectEnabled()).toBe(true);

    const h = makeEditorHarness({
      text: "a portta ",
      cursorOffset: 10
    });

    handleAutocorrectUpdate(
      h.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 20 } },
        before: { content: { size: 19 } },
        getMeta: () => undefined
      } as never
    );

    expect(h.getDocText()).toBe("a porta ");
    expect(h.getCursor()).toBe(9);

    // Ctrl+Z right after space+replacement reverts back to "portta".
    const ctrlZ = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      cancelable: true
    });
    expect(
      handleAutocorrectKeyDown(h.view as never, ctrlZ)
    ).toBe(true);
    expect(ctrlZ.defaultPrevented).toBe(true);
    expect(h.getDocText()).toBe("a portta ");

    // "portta" is now ignored; a second spacebar check should not fight the user.
    const h2 = makeEditorHarness({ text: "portta ", cursorOffset: 8 });
    handleAutocorrectUpdate(
      h2.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 15 } },
        before: { content: { size: 14 } },
        getMeta: () => undefined
      } as never
    );
    expect(h2.getDocText()).toBe("portta ");

    // Double-Backspace mobile flow: deleting trailing space puts cursor at end of "telefonn" replacement.
    const h3 = makeEditorHarness({ text: "telefonn ", cursorOffset: 10 });
    handleAutocorrectUpdate(
      h3.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 20 } },
        before: { content: { size: 19 } },
        getMeta: () => undefined
      } as never
    );
    expect(h3.getDocText()).toBe("telefone ");
    // Simulate user deleting the space (cursor lands right after "telefone" = pos 9).
    h3.setCursor(9);
    const bs = new KeyboardEvent("keydown", {
      key: "Backspace",
      cancelable: true
    });
    expect(handleAutocorrectKeyDown(h3.view as never, bs)).toBe(true);
    expect(bs.defaultPrevented).toBe(true);
    expect(h3.getDocText()).toBe("telefonn ");

    setAutocorrectFallbackEngineForTesting(null);
  });

  it("ignores deletions, pastes, code blocks, inline code, links, and Enter trailing-char preservation", () => {
    const raw = readFileSync(LEXICON_PATH, "utf8");
    const engine = new NookLabAutocorrectEngine(raw);
    setAutocorrectFallbackEngineForTesting(engine);
    setAutocorrectEnabled(true);

    // Shrink (Backspace/Delete)
    const shrink = makeEditorHarness({ text: "portta ", cursorOffset: 8 });
    handleAutocorrectUpdate(
      shrink.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 9 } },
        before: { content: { size: 10 } },
        getMeta: () => undefined
      } as never
    );
    expect(shrink.getDocText()).toBe("portta ");

    // Paste
    handleAutocorrectUpdate(
      shrink.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 15 } },
        before: { content: { size: 5 } },
        getMeta: (k: string) => (k === "paste" ? true : undefined)
      } as never
    );
    expect(shrink.getDocText()).toBe("portta ");

    // Code block & inline code
    const codeBlock = makeEditorHarness({
      text: "portta ",
      nodeType: "codeBlock",
      cursorOffset: 8
    });
    handleAutocorrectUpdate(
      codeBlock.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 15 } },
        before: { content: { size: 14 } },
        getMeta: () => undefined
      } as never
    );
    expect(codeBlock.getDocText()).toBe("portta ");

    const inlineCode = makeEditorHarness({
      text: "portta ",
      marks: ["code"],
      cursorOffset: 8
    });
    handleAutocorrectUpdate(
      inlineCode.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 15 } },
        before: { content: { size: 14 } },
        getMeta: () => undefined
      } as never
    );
    expect(inlineCode.getDocText()).toBe("portta ");

    // Enter paragraph split: checks end of previous paragraph without slicing final letter!
    const enterSplit = makeEditorHarness({
      prevParagraphText: "isclaresimento",
      text: "",
      cursorOffset: 17 // 14 + 2 (prev paragraph) + 1 (current paragraph start)
    });
    handleAutocorrectUpdate(
      enterSplit.editor as never,
      {
        docChanged: true,
        doc: { content: { size: 18 } },
        before: { content: { size: 16 } },
        getMeta: () => undefined
      } as never
    );
    expect(enterSplit.dispatches).toEqual([
      { from: 1, to: 15, text: "esclarecimento" }
    ]);

    setAutocorrectFallbackEngineForTesting(null);
  });
});
