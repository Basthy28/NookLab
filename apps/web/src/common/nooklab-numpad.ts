/*
 * NookLab — force physical Numpad keys (0-9 and decimal) to always enter
 * digits across the app, even when NumLock is turned off.
 *
 * When NumLock is off on Windows/Linux, the OS translates physical Numpad keys
 * into ArrowDown/End/PageDown/Delete before Chromium dispatches keyboard events,
 * while still preserving `event.code` ("Numpad0".."Numpad9", "NumpadDecimal").
 */
import type { TiptapOptions } from "@notesnook/editor";

type EditorKeyDownView = Parameters<
  NonNullable<NonNullable<TiptapOptions["editorProps"]>["handleKeyDown"]>
>[0];

const NUMPAD_DIGIT_MAP: Record<string, string> = {
  Numpad0: "0",
  Numpad1: "1",
  Numpad2: "2",
  Numpad3: "3",
  Numpad4: "4",
  Numpad5: "5",
  Numpad6: "6",
  Numpad7: "7",
  Numpad8: "8",
  Numpad9: "9",
  NumpadDecimal: "."
};

const TEXT_INPUT_TYPES = new Set([
  "",
  "text",
  "search",
  "url",
  "tel",
  "email",
  "password",
  "number"
]);

/**
 * Returns the digit/decimal character to force if the event is an unmodified
 * physical Numpad key whose OS-translated `key` is not already a digit/decimal.
 */
export function getNumpadForcedChar(event: KeyboardEvent): string | null {
  const mapped = NUMPAD_DIGIT_MAP[event.code];
  if (!mapped) return null;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
    return null;
  }
  if (event.isComposing) return null;
  if (/^[0-9.,]$/.test(event.key)) return null;
  return mapped;
}

function insertIntoTextControl(
  target: HTMLInputElement | HTMLTextAreaElement,
  char: string
) {
  if (
    typeof target.selectionStart === "number" &&
    typeof target.selectionEnd === "number"
  ) {
    target.setRangeText(char, target.selectionStart, target.selectionEnd, "end");
  } else {
    // <input type="number"> does not support setRangeText/selectionStart.
    const nextValue =
      char === "." && target.value.includes(".")
        ? target.value
        : target.value + char;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    if (setter) setter.call(target, nextValue);
    else target.value = nextValue;
  }
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function isManagedProseMirrorTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return !!target.closest(".ProseMirror") && !target.closest(".cm-editor");
}

/**
 * Handles NumLock-off Numpad keys directly inside ProseMirror so marks,
 * undo history, scrollIntoView, and editor state updates stay native.
 */
export function handleNumpadEditorKeyDown(
  view: EditorKeyDownView,
  event: KeyboardEvent
): boolean {
  const char = getNumpadForcedChar(event);
  if (!char) return false;

  event.preventDefault();
  event.stopPropagation();
  if (!view.editable) return true;

  view.dispatch(view.state.tr.insertText(char).scrollIntoView());
  return true;
}

/**
 * Installs capture-phase listeners so NumLock-off Numpad keys type digits in
 * text inputs/textareas and never trigger list navigation or Delete on keyup.
 */
export function installNookLabNumpadGuard(): () => void {
  function onKeyDown(event: KeyboardEvent) {
    const char = getNumpadForcedChar(event);
    if (!char) return;
    if (isManagedProseMirrorTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.target;
    if (
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        TEXT_INPUT_TYPES.has((target.type || "").toLowerCase()))
    ) {
      if (!target.readOnly && !target.disabled) {
        insertIntoTextControl(target, char);
      }
      return;
    }

    if (target instanceof HTMLElement && target.isContentEditable) {
      document.execCommand("insertText", false, char);
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (!getNumpadForcedChar(event)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);
  };
}
