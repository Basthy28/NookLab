/*
 * NookLab — unit tests for forcing Numpad digit entry when NumLock is off.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getNumpadForcedChar,
  handleNumpadEditorKeyDown,
  installNookLabNumpadGuard
} from "../src/common/nooklab-numpad";

function makeNumpadEvent(
  type: "keydown" | "keyup",
  init: {
    code: string;
    key: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
  }
) {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code: init.code,
    key: init.key,
    shiftKey: init.shiftKey,
    ctrlKey: init.ctrlKey,
    altKey: init.altKey,
    metaKey: init.metaKey
  });
}

describe("nooklab-numpad", () => {
  it("maps NumLock-off numpad navigation/delete keys to digits and dot", () => {
    const cases: Array<[string, string, string]> = [
      ["Numpad0", "Insert", "0"],
      ["Numpad1", "End", "1"],
      ["Numpad2", "ArrowDown", "2"],
      ["Numpad3", "PageDown", "3"],
      ["Numpad4", "ArrowLeft", "4"],
      ["Numpad5", "Clear", "5"],
      ["Numpad6", "ArrowRight", "6"],
      ["Numpad7", "Home", "7"],
      ["Numpad8", "ArrowUp", "8"],
      ["Numpad9", "PageUp", "9"],
      ["NumpadDecimal", "Delete", "."]
    ];

    for (const [code, key, expected] of cases) {
      expect(getNumpadForcedChar(makeNumpadEvent("keydown", { code, key }))).toBe(
        expected
      );
    }
  });

  it("ignores native NumLock-on digits/decimals and modified shortcuts", () => {
    expect(
      getNumpadForcedChar(makeNumpadEvent("keydown", { code: "Numpad2", key: "2" }))
    ).toBeNull();
    expect(
      getNumpadForcedChar(
        makeNumpadEvent("keydown", { code: "NumpadDecimal", key: "," })
      )
    ).toBeNull();
    expect(
      getNumpadForcedChar(
        makeNumpadEvent("keydown", {
          code: "Numpad2",
          key: "ArrowDown",
          shiftKey: true
        })
      )
    ).toBeNull();
    expect(
      getNumpadForcedChar(
        makeNumpadEvent("keydown", {
          code: "Numpad2",
          key: "ArrowDown",
          ctrlKey: true
        })
      )
    ).toBeNull();
  });

  it("inserts digits into editable ProseMirror views and blocks readonly views", () => {
    const scrollIntoView = vi.fn(() => "tr-scrolled");
    const insertText = vi.fn(() => ({ scrollIntoView }));
    const dispatch = vi.fn();
    const view = {
      editable: true,
      state: { tr: { insertText } },
      dispatch
    } as unknown as Parameters<typeof handleNumpadEditorKeyDown>[0];

    const ev = makeNumpadEvent("keydown", { code: "Numpad2", key: "ArrowDown" });
    expect(handleNumpadEditorKeyDown(view, ev)).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(insertText).toHaveBeenCalledWith("2");
    expect(dispatch).toHaveBeenCalledWith("tr-scrolled");

    const readonlyDispatch = vi.fn();
    const readonlyView = {
      editable: false,
      state: { tr: { insertText } },
      dispatch: readonlyDispatch
    } as unknown as Parameters<typeof handleNumpadEditorKeyDown>[0];
    const roEv = makeNumpadEvent("keydown", { code: "Numpad1", key: "End" });
    expect(handleNumpadEditorKeyDown(readonlyView, roEv)).toBe(true);
    expect(roEv.defaultPrevented).toBe(true);
    expect(readonlyDispatch).not.toHaveBeenCalled();
  });

  it("forces digits into inputs/textareas and suppresses keydown/keyup outside editors", () => {
    const uninstall = installNookLabNumpadGuard();
    try {
      const textarea = document.createElement("textarea");
      textarea.value = "ab";
      textarea.setSelectionRange(1, 1);
      document.body.appendChild(textarea);

      const inputListener = vi.fn();
      textarea.addEventListener("input", inputListener);

      const taEv = makeNumpadEvent("keydown", { code: "Numpad4", key: "ArrowLeft" });
      textarea.dispatchEvent(taEv);
      expect(taEv.defaultPrevented).toBe(true);
      expect(textarea.value).toBe("a4b");
      expect(inputListener).toHaveBeenCalledTimes(1);

      const card = document.createElement("div");
      document.body.appendChild(card);
      const cardKeyDown = vi.fn();
      const cardKeyUp = vi.fn();
      card.addEventListener("keydown", cardKeyDown);
      card.addEventListener("keyup", cardKeyUp);

      const delDown = makeNumpadEvent("keydown", {
        code: "NumpadDecimal",
        key: "Delete"
      });
      const delUp = makeNumpadEvent("keyup", {
        code: "NumpadDecimal",
        key: "Delete"
      });
      card.dispatchEvent(delDown);
      card.dispatchEvent(delUp);
      expect(delDown.defaultPrevented).toBe(true);
      expect(delUp.defaultPrevented).toBe(true);
      expect(cardKeyDown).not.toHaveBeenCalled();
      expect(cardKeyUp).not.toHaveBeenCalled();

      // ProseMirror target should pass through keydown to editorProps.handleKeyDown.
      const pm = document.createElement("div");
      pm.className = "ProseMirror";
      document.body.appendChild(pm);
      const pmDown = makeNumpadEvent("keydown", {
        code: "Numpad2",
        key: "ArrowDown"
      });
      pm.dispatchEvent(pmDown);
      expect(pmDown.defaultPrevented).toBe(false);
    } finally {
      uninstall();
      document.body.innerHTML = "";
    }
  });
});
