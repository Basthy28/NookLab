/*
 * NookLab — compact "Service Sheet" popover tool on the bottom editor toolbar.
 * Provides 1-click bottom-up 1-page Word copy, direct A4 print, and compact
 * selection copy (without empty-line paragraph spacing).
 */
import {
  mdiChevronDown,
  mdiContentCopy,
  mdiFileDocumentOutline,
  mdiMinus,
  mdiPlus,
  mdiPrinterOutline
} from "@mdi/js";
import type { Editor } from "@notesnook/editor";
import { Icon, PopupPresenter } from "@notesnook/ui";
import { Button, Flex, Text } from "@theme-ui/components";
import { useMemo, useRef, useState } from "react";
import {
  copyPackedServiceSheet,
  copySelectionWithoutSpacing,
  getActiveNoteTitle,
  loadServiceSheetSettings,
  packBottomToFit,
  printPackedServiceSheet,
  saveServiceSheetSettings,
  type ServiceSheetMode,
  type ServiceSheetSettings
} from "../../common/nooklab-service-sheet";

const MODE_OPTIONS: Array<{ id: ServiceSheetMode; label: string }> = [
  { id: "word", label: "Word A4" },
  { id: "a4", label: "Compact" },
  { id: "lines", label: "Lines" }
];

export function NookLabSheetTool({ editor }: { editor: Editor }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<ServiceSheetSettings>(() =>
    loadServiceSheetSettings()
  );

  const preview = useMemo(() => {
    if (!isOpen) return null;
    return packBottomToFit(
      editor.getHTML(),
      settings,
      getActiveNoteTitle(editor)
    );
  }, [isOpen, editor, settings]);

  const updateSettings = (patch: Partial<ServiceSheetSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveServiceSheetSettings(next);
      return next;
    });
  };

  const hasSelection = !editor.state.selection.empty;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        id="tool-nooklab-service-sheet"
        title="Service sheet (1-page Word copy / A4 print)"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setIsOpen((v) => !v)}
        sx={{
          height: "unset",
          flexShrink: 0,
          px: "6px",
          py: "4px",
          borderRadius: "default",
          m: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          bg: isOpen ? "background-selected" : "transparent"
        }}
      >
        <Icon
          path={mdiFileDocumentOutline}
          color={isOpen ? "icon-selected" : "icon"}
          size="big"
        />
        <Icon
          path={mdiChevronDown}
          color={isOpen ? "icon-selected" : "icon"}
          size={13}
        />
      </Button>
      <PopupPresenter
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        position={{
          isTargetAbsolute: true,
          target: buttonRef.current,
          location: "below",
          align: "start",
          yOffset: 6
        }}
      >
        <Flex
          data-test-id="nooklab-service-sheet-popover"
          sx={{
            width: 336,
            maxWidth: "92vw",
            p: "14px",
            gap: "12px",
            flexDirection: "column",
            bg: "background",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            boxShadow: "0px 10px 28px rgba(0, 0, 0, 0.22)"
          }}
        >
          {/* Header */}
          <Flex sx={{ justifyContent: "space-between", alignItems: "center" }}>
            <Flex sx={{ alignItems: "center", gap: "8px" }}>
              <Icon path={mdiFileDocumentOutline} color="accent" size={18} />
              <Text
                variant="subtitle"
                sx={{ fontSize: "14px", fontWeight: 600, color: "paragraph" }}
              >
                Service Sheet
              </Text>
            </Flex>
            {preview && preview.lineCount > 0 ? (
              <Text
                variant="subBody"
                sx={{
                  px: "8px",
                  py: "2px",
                  borderRadius: "999px",
                  bg: "background-secondary",
                  border: "1px solid var(--border)",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "paragraph"
                }}
              >
                {preview.groupCount > 1
                  ? `${preview.groupCount} entries • ~${preview.estimatedLines} lines`
                  : `~${preview.estimatedLines} lines`}
              </Text>
            ) : null}
          </Flex>

          {/* Range summary card */}
          {preview && preview.lineCount > 0 ? (
            <Flex
              sx={{
                flexDirection: "column",
                gap: "4px",
                px: "10px",
                py: "8px",
                bg: "background-secondary",
                borderRadius: "8px",
                border: "1px solid var(--border)"
              }}
            >
              <Flex sx={{ gap: "6px", alignItems: "center" }}>
                <Text
                  variant="subBody"
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "paragraph-secondary",
                    flexShrink: 0,
                    minWidth: "34px"
                  }}
                >
                  Start:
                </Text>
                <Text
                  variant="subBody"
                  sx={{
                    fontSize: "12px",
                    color: "paragraph",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {preview.firstLinePreview || "—"}
                </Text>
              </Flex>
              <Flex sx={{ gap: "6px", alignItems: "center" }}>
                <Text
                  variant="subBody"
                  sx={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "paragraph-secondary",
                    flexShrink: 0,
                    minWidth: "34px"
                  }}
                >
                  End:
                </Text>
                <Text
                  variant="subBody"
                  sx={{
                    fontSize: "12px",
                    color: "paragraph",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {preview.lastLinePreview || "—"}
                </Text>
              </Flex>
            </Flex>
          ) : (
            <Flex
              sx={{
                px: "10px",
                py: "10px",
                bg: "background-secondary",
                borderRadius: "8px",
                border: "1px solid var(--border)"
              }}
            >
              <Text variant="subBody" sx={{ color: "paragraph-secondary" }}>
                Empty note — write service entries to pack 1 page.
              </Text>
            </Flex>
          )}

          {/* Primary actions */}
          <Flex sx={{ flexDirection: "column", gap: "8px" }}>
            <Button
              variant="accent"
              id="nooklab-copy-1page-btn"
              onClick={async () => {
                await copyPackedServiceSheet(editor, settings);
                setIsOpen(false);
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                height: "36px",
                px: "12px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: 600
              }}
            >
              <Icon path={mdiContentCopy} color="accentForeground" size={16} />
              <span>Copy 1 page (Word)</span>
            </Button>

            <Flex sx={{ gap: "8px" }}>
              <Button
                variant="secondary"
                id="nooklab-print-1page-btn"
                onClick={async () => {
                  setIsOpen(false);
                  await printPackedServiceSheet(editor, settings);
                }}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  height: "34px",
                  px: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  bg: "background-secondary",
                  fontSize: "12px",
                  fontWeight: 500
                }}
              >
                <Icon path={mdiPrinterOutline} color="icon" size={15} />
                <span>Print 1 page</span>
              </Button>

              <Button
                variant="secondary"
                id="nooklab-copy-compact-btn"
                title="Shortcut: Ctrl+Shift+C"
                onClick={async () => {
                  await copySelectionWithoutSpacing(editor, settings);
                  setIsOpen(false);
                }}
                sx={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  height: "34px",
                  px: "10px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  bg: "background-secondary",
                  fontSize: "12px",
                  fontWeight: 500
                }}
              >
                <Icon path={mdiContentCopy} color="icon" size={14} />
                <span>{hasSelection ? "Copy selection" : "Copy all clean"}</span>
              </Button>
            </Flex>
          </Flex>

          {/* Calibration controls */}
          <Flex
            sx={{
              flexDirection: "column",
              gap: "10px",
              pt: "10px",
              borderTop: "1px solid var(--separator)"
            }}
          >
            {/* Segmented mode selector */}
            <Flex
              sx={{
                gap: "4px",
                p: "3px",
                bg: "background-secondary",
                borderRadius: "8px",
                border: "1px solid var(--border)"
              }}
            >
              {MODE_OPTIONS.map((opt) => {
                const active = settings.mode === opt.id;
                return (
                  <Button
                    key={opt.id}
                    variant={active ? "accent" : "secondary"}
                    onClick={() => updateSettings({ mode: opt.id })}
                    sx={{
                      flex: 1,
                      height: "28px",
                      px: "8px",
                      py: 0,
                      borderRadius: "6px",
                      fontSize: "12px",
                      fontWeight: active ? 600 : 500,
                      bg: active ? undefined : "transparent",
                      border: "none"
                    }}
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </Flex>

            {/* Numeric stepper row */}
            {settings.mode === "lines" ? (
              <Flex
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <Text variant="subBody" sx={{ fontSize: "12px" }}>
                  Max lines per page
                </Text>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Button
                    variant="secondary"
                    aria-label="Decrease lines"
                    onClick={() =>
                      updateSettings({
                        maxLines: Math.max(20, settings.maxLines - 1)
                      })
                    }
                    sx={{
                      width: "28px",
                      height: "28px",
                      p: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      bg: "background-secondary"
                    }}
                  >
                    <Icon path={mdiMinus} color="icon" size={14} />
                  </Button>
                  <Text
                    variant="subBody"
                    sx={{
                      minWidth: "46px",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                  >
                    {settings.maxLines}
                  </Text>
                  <Button
                    variant="secondary"
                    aria-label="Increase lines"
                    onClick={() =>
                      updateSettings({
                        maxLines: Math.min(90, settings.maxLines + 1)
                      })
                    }
                    sx={{
                      width: "28px",
                      height: "28px",
                      p: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      bg: "background-secondary"
                    }}
                  >
                    <Icon path={mdiPlus} color="icon" size={14} />
                  </Button>
                </Flex>
              </Flex>
            ) : (
              <Flex
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <Text variant="subBody" sx={{ fontSize: "12px" }}>
                  Font size ({settings.mode === "word" ? "2.5×3cm" : "narrow"})
                </Text>
                <Flex sx={{ alignItems: "center", gap: "6px" }}>
                  <Button
                    variant="secondary"
                    aria-label="Decrease font size"
                    onClick={() =>
                      updateSettings({
                        fontSizePt: Math.max(8.5, settings.fontSizePt - 0.5)
                      })
                    }
                    sx={{
                      width: "28px",
                      height: "28px",
                      p: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      bg: "background-secondary"
                    }}
                  >
                    <Icon path={mdiMinus} color="icon" size={14} />
                  </Button>
                  <Text
                    variant="subBody"
                    sx={{
                      minWidth: "46px",
                      textAlign: "center",
                      fontSize: "12px",
                      fontWeight: 600
                    }}
                  >
                    {settings.fontSizePt}pt
                  </Text>
                  <Button
                    variant="secondary"
                    aria-label="Increase font size"
                    onClick={() =>
                      updateSettings({
                        fontSizePt: Math.min(13, settings.fontSizePt + 0.5)
                      })
                    }
                    sx={{
                      width: "28px",
                      height: "28px",
                      p: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      bg: "background-secondary"
                    }}
                  >
                    <Icon path={mdiPlus} color="icon" size={14} />
                  </Button>
                </Flex>
              </Flex>
            )}

            {/* Clean boolean options */}
            <Flex sx={{ flexDirection: "column", gap: "6px" }}>
              <Flex
                as="label"
                sx={{
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.wholeBlocksOnly}
                  style={{ accentColor: "var(--accent)", width: "14px", height: "14px", margin: 0 }}
                  onChange={(e) =>
                    updateSettings({ wholeBlocksOnly: e.target.checked })
                  }
                />
                <Text variant="subBody" sx={{ fontSize: "12px", color: "paragraph" }}>
                  Keep whole service blocks (no split)
                </Text>
              </Flex>

              <Flex
                as="label"
                sx={{
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={settings.removeEmptyLines}
                  style={{ accentColor: "var(--accent)", width: "14px", height: "14px", margin: 0 }}
                  onChange={(e) =>
                    updateSettings({ removeEmptyLines: e.target.checked })
                  }
                />
                <Text variant="subBody" sx={{ fontSize: "12px", color: "paragraph" }}>
                  Remove blank lines
                </Text>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </PopupPresenter>
    </>
  );
}
