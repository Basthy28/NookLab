/*
 * NookLab — quick Note Color square button + popover for the Web editor toolbar.
 */
import { mdiCheck, mdiClose, mdiPlus } from "@mdi/js";
import { Color } from "@notesnook/core";
import { Icon, PopupPresenter } from "@notesnook/ui";
import { Button, Flex, Text } from "@theme-ui/components";
import { useEffect, useRef, useState } from "react";
import { db } from "../../common/db";
import { CreateColorDialog } from "../../dialogs/create-color-dialog";
import { useStore as useAppStore } from "../../stores/app-store";
import { useEditorStore } from "../../stores/editor-store";
import { useStore as useNoteStore } from "../../stores/note-store";

const PRESET_NOTE_COLORS = [
  { title: "Red", colorCode: "#dc2626" },
  { title: "Orange", colorCode: "#f97316" },
  { title: "Yellow", colorCode: "#eab308" },
  { title: "Green", colorCode: "#22c55e" },
  { title: "Blue", colorCode: "#3b82f6" },
  { title: "Purple", colorCode: "#a855f7" },
  { title: "Gray", colorCode: "#64748b" }
];

export function NookLabNoteColorTool() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [noteColor, setNoteColor] = useState<Color | undefined>(undefined);
  const [refreshTick, setRefreshTick] = useState(0);

  const activeNoteId = useEditorStore((s) => s.getActiveNote()?.id);
  const colors = useAppStore((s) => s.colors);
  const notes = useNoteStore((s) => s.notes);
  const contextNotes = useNoteStore((s) => s.contextNotes);

  useEffect(() => {
    let cancelled = false;
    if (!activeNoteId) {
      setNoteColor(undefined);
      return;
    }
    db.relations
      .to({ type: "note", id: activeNoteId }, "color")
      .resolve()
      .then((list) => {
        if (!cancelled) setNoteColor(list[0]);
      })
      .catch(() => {
        if (!cancelled) setNoteColor(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [activeNoteId, colors, notes, contextNotes, refreshTick]);

  if (!activeNoteId) return null;

  const applyExistingColor = async (color: Color) => {
    const isChecked = noteColor?.id === color.id;
    await useNoteStore.getState().setColor(color.id, isChecked, activeNoteId);
    setNoteColor(isChecked ? undefined : color);
    setRefreshTick((t) => t + 1);
    setIsOpen(false);
  };

  const applyPresetColor = async (preset: {
    title: string;
    colorCode: string;
  }) => {
    const existing = colors.find(
      (c) => c.colorCode.toLowerCase() === preset.colorCode.toLowerCase()
    );
    if (existing) {
      await applyExistingColor(existing);
      return;
    }
    const id = await db.colors.add({
      title: preset.title,
      colorCode: preset.colorCode
    });
    if (!id) return;
    await useNoteStore.getState().setColor(id, false, activeNoteId);
    const created = await db.colors.color(id);
    setNoteColor(created);
    setRefreshTick((t) => t + 1);
    setIsOpen(false);
  };

  const savedHexes = new Set(colors.map((c) => c.colorCode.toLowerCase()));
  const extraPresets = PRESET_NOTE_COLORS.filter(
    (p) => !savedHexes.has(p.colorCode.toLowerCase())
  );

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        id="tool-nooklab-note-color"
        title={
          noteColor
            ? `Note color: ${noteColor.title}`
            : "Set note color"
        }
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setIsOpen((v) => !v)}
        sx={{
          height: "unset",
          flexShrink: 0,
          p: "6px",
          borderRadius: "default",
          m: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          bg: isOpen ? "background-selected" : "transparent"
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: "16px",
            height: "16px",
            borderRadius: "4px",
            display: "inline-block",
            backgroundColor: noteColor ? noteColor.colorCode : "transparent",
            border: noteColor
              ? "1.5px solid rgba(255, 255, 255, 0.45)"
              : "2px solid var(--icon)",
            boxShadow: noteColor
              ? "0 0 0 1px rgba(0, 0, 0, 0.18)"
              : undefined
          }}
        />
      </Button>

      <PopupPresenter
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        position={{
          target: buttonRef.current || "mouse",
          align: "end",
          location: "below",
          yOffset: 6
        }}
      >
        <Flex
          data-test-id="nooklab-note-color-popover"
          onMouseDown={(e) => e.preventDefault()}
          sx={{
            flexDirection: "column",
            gap: "8px",
            p: "12px",
            width: 240,
            bg: "background",
            border: "1px solid var(--border)",
            borderRadius: "default",
            boxShadow: "menu",
            color: "paragraph"
          }}
        >
          <Flex sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Text variant="subtitle" sx={{ fontSize: "13px", fontWeight: 600 }}>
              Note color
            </Text>
            {noteColor ? (
              <Button
                variant="secondary"
                onClick={() => applyExistingColor(noteColor)}
                sx={{
                  px: "6px",
                  py: "2px",
                  fontSize: "11px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px"
                }}
              >
                <Icon path={mdiClose} size={12} color="icon" />
                <span>Clear</span>
              </Button>
            ) : null}
          </Flex>

          {colors.length > 0 ? (
            <Flex sx={{ flexDirection: "column", gap: "4px" }}>
              {colors.map((color) => {
                const active = noteColor?.id === color.id;
                return (
                  <Button
                    key={color.id}
                    variant="menuitem"
                    onClick={() => applyExistingColor(color)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      px: "8px",
                      py: "6px",
                      borderRadius: "default",
                      bg: active ? "background-selected" : "transparent"
                    }}
                  >
                    <Flex sx={{ alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 4,
                          flexShrink: 0,
                          backgroundColor: color.colorCode
                        }}
                      />
                      <Text
                        variant="body"
                        sx={{
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}
                      >
                        {color.title}
                      </Text>
                    </Flex>
                    {active ? (
                      <Icon path={mdiCheck} size={14} color="accent" />
                    ) : null}
                  </Button>
                );
              })}
            </Flex>
          ) : null}

          {extraPresets.length > 0 ? (
            <Flex sx={{ flexWrap: "wrap", gap: "6px", pt: colors.length ? "4px" : 0 }}>
              {extraPresets.map((preset) => (
                <Button
                  key={preset.colorCode}
                  variant="secondary"
                  title={preset.title}
                  onClick={() => applyPresetColor(preset)}
                  sx={{
                    width: 24,
                    height: 24,
                    p: 0,
                    borderRadius: "6px",
                    bg: preset.colorCode,
                    border: "1px solid rgba(0,0,0,0.2)"
                  }}
                />
              ))}
            </Flex>
          ) : null}

          <Button
            variant="secondary"
            onClick={async () => {
              setIsOpen(false);
              const id = await CreateColorDialog.show({});
              if (!id) return;
              await useNoteStore
                .getState()
                .setColor(id, false, activeNoteId);
              const created = await db.colors.color(id);
              setNoteColor(created);
              setRefreshTick((t) => t + 1);
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              py: "6px",
              fontSize: "12px",
              borderRadius: "default"
            }}
          >
            <Icon path={mdiPlus} size={14} color="icon" />
            <span>New color</span>
          </Button>
        </Flex>
      </PopupPresenter>
    </>
  );
}
