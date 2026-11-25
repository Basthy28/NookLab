/*
 * NookLab — mobile Service Sheet popover tool for 1-page bottom-up copy and
 * spacing-free clean copy inside the React Native WebView editor.
 */
import {
  mdiChevronDown,
  mdiClose,
  mdiContentCopy,
  mdiFileDocumentOutline,
  mdiMinus,
  mdiPlus
} from "@mdi/js";
import MdiIcon from "@mdi/react";
import type { Editor } from "@notesnook/editor";
import { useThemeColors } from "@notesnook/theme";
import React, { useMemo, useState } from "react";
import {
  copyAllCleanServiceSheet,
  copyPackedServiceSheet,
  loadServiceSheetSettings,
  packBottomToFit,
  saveServiceSheetSettings,
  type ServiceSheetMode,
  type ServiceSheetSettings
} from "../common/nooklab-service-sheet";
import { useTabContext } from "../hooks/useTabStore";

const MODE_OPTIONS: Array<{ id: ServiceSheetMode; label: string }> = [
  { id: "word", label: "Word A4" },
  { id: "a4", label: "Compact" },
  { id: "lines", label: "Lines" }
];

const preventFocusLoss = (e: React.MouseEvent<HTMLElement>) => {
  e.preventDefault();
};

export function NookLabSheetTool({ editor }: { editor: Editor }) {
  const { colors } = useThemeColors("editorToolbar");
  const tab = useTabContext();
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState<ServiceSheetSettings>(() =>
    loadServiceSheetSettings()
  );

  const noteTitle =
    globalThis.editorControllers?.[tab.id]?.title || "Service Sheet";

  const preview = useMemo(() => {
    if (!isOpen) return null;
    return packBottomToFit(editor.getHTML(), settings, noteTitle);
  }, [isOpen, editor, settings, noteTitle]);

  const updateSettings = (patch: Partial<ServiceSheetSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveServiceSheetSettings(next);
      return next;
    });
  };

  const adjustStep = (delta: number) => {
    if (settings.mode === "lines") {
      updateSettings({
        maxLines: Math.max(20, Math.min(90, settings.maxLines + delta))
      });
      return;
    }
    const nextPt = Number(
      Math.max(8.5, Math.min(13, settings.fontSizePt + delta * 0.5)).toFixed(1)
    );
    updateSettings({ fontSizePt: nextPt });
  };

  const iconColor = colors.primary.icon;
  const activeIconColor = colors.selected.icon || colors.primary.accent;
  const separatorColor = colors.primary.separator || colors.primary.border;
  const mutedTextColor = colors.secondary.paragraph || colors.primary.icon;

  return (
    <>
      <button
        type="button"
        id="tool-nooklab-service-sheet"
        title="Service sheet (1-page copy / clean copy)"
        tabIndex={-1}
        onMouseDown={preventFocusLoss}
        onClick={() => setIsOpen((v) => !v)}
        style={{
          height: "28px",
          flexShrink: 0,
          padding: "0 6px",
          borderRadius: "6px",
          border: "none",
          margin: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          cursor: "pointer",
          backgroundColor: isOpen ? colors.selected.background : "transparent"
        }}
      >
        <MdiIcon
          path={mdiFileDocumentOutline}
          size="20px"
          color={isOpen ? activeIconColor : iconColor}
        />
        <MdiIcon
          path={mdiChevronDown}
          size="13px"
          color={isOpen ? activeIconColor : iconColor}
        />
      </button>

      {isOpen ? (
        <div
          className="theme-scope-editorToolbar"
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            padding: "12px",
            paddingBottom: "88px"
          }}
        >
          <div
            data-test-id="nooklab-service-sheet-popover"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "360px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              backgroundColor: colors.primary.background,
              border: `1px solid ${colors.primary.border}`,
              borderRadius: "12px",
              boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.35)",
              color: colors.primary.paragraph
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "8px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MdiIcon
                  path={mdiFileDocumentOutline}
                  size="18px"
                  color={colors.primary.accent}
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: colors.primary.heading
                  }}
                >
                  Service Sheet
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                {preview && preview.lineCount > 0 ? (
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: "999px",
                      backgroundColor: colors.secondary.background,
                      border: `1px solid ${colors.primary.border}`,
                      fontSize: "11px",
                      fontWeight: 600,
                      color: colors.primary.paragraph
                    }}
                  >
                    {preview.groupCount > 1
                      ? `${preview.groupCount} entries • ~${preview.estimatedLines} lines`
                      : `~${preview.estimatedLines} lines`}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    border: "none",
                    background: "transparent",
                    padding: "2px",
                    display: "inline-flex",
                    cursor: "pointer"
                  }}
                >
                  <MdiIcon path={mdiClose} size="16px" color={iconColor} />
                </button>
              </div>
            </div>

            {preview && preview.lineCount > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  padding: "8px 10px",
                  backgroundColor: colors.secondary.background,
                  borderRadius: "8px",
                  border: `1px solid ${colors.primary.border}`
                }}
              >
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      color: mutedTextColor,
                      minWidth: "36px"
                    }}
                  >
                    Start:
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: colors.primary.paragraph,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {preview.firstLinePreview}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      color: mutedTextColor,
                      minWidth: "36px"
                    }}
                  >
                    End:
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: colors.primary.paragraph,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {preview.lastLinePreview}
                  </span>
                </div>
              </div>
            ) : (
              <span
                style={{
                  color: mutedTextColor,
                  fontSize: "12px",
                  padding: "4px 0"
                }}
              >
                Note has no copyable lines yet.
              </span>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <button
                type="button"
                disabled={!preview || preview.lineCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  copyPackedServiceSheet(tab.id, editor, settings, noteTitle);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "10px",
                  fontWeight: 600,
                  fontSize: "13px",
                  borderRadius: "8px",
                  border: "none",
                  cursor: "pointer",
                  backgroundColor: colors.primary.accent,
                  color: colors.primary.accentForeground,
                  opacity: !preview || preview.lineCount === 0 ? 0.5 : 1
                }}
              >
                <MdiIcon
                  path={mdiContentCopy}
                  size="16px"
                  color={colors.primary.accentForeground}
                />
                <span>Copy 1 page (Word / Text)</span>
              </button>

              <button
                type="button"
                disabled={!preview || preview.lineCount === 0}
                onMouseDown={preventFocusLoss}
                onClick={() => {
                  copyAllCleanServiceSheet(tab.id, editor, settings);
                  setIsOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  width: "100%",
                  padding: "8px",
                  fontSize: "12px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.primary.border}`,
                  cursor: "pointer",
                  backgroundColor: colors.secondary.background,
                  color: colors.primary.paragraph,
                  opacity: !preview || preview.lineCount === 0 ? 0.5 : 1
                }}
              >
                <MdiIcon path={mdiContentCopy} size="15px" color={iconColor} />
                <span>Copy all clean</span>
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                paddingTop: "8px",
                borderTop: `1px solid ${separatorColor}`
              }}
            >
              <div
                style={{
                  display: "flex",
                  backgroundColor: colors.secondary.background,
                  padding: "3px",
                  borderRadius: "8px",
                  border: `1px solid ${colors.primary.border}`,
                  gap: "2px"
                }}
              >
                {MODE_OPTIONS.map((opt) => {
                  const active = settings.mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onMouseDown={preventFocusLoss}
                      onClick={() => updateSettings({ mode: opt.id })}
                      style={{
                        flex: 1,
                        padding: "5px 4px",
                        fontSize: "11px",
                        fontWeight: active ? 600 : 500,
                        borderRadius: "6px",
                        border: "none",
                        cursor: "pointer",
                        backgroundColor: active
                          ? colors.primary.accent
                          : "transparent",
                        color: active
                          ? colors.primary.accentForeground
                          : colors.primary.paragraph
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px"
                }}
              >
                <span style={{ fontSize: "12px", color: mutedTextColor }}>
                  {settings.mode === "lines" ? "Max lines" : "Font size"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => adjustStep(-1)}
                    style={{
                      padding: "4px",
                      border: `1px solid ${colors.primary.border}`,
                      borderRadius: "6px",
                      display: "inline-flex",
                      backgroundColor: colors.secondary.background,
                      cursor: "pointer"
                    }}
                  >
                    <MdiIcon path={mdiMinus} size="14px" color={iconColor} />
                  </button>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      minWidth: "46px",
                      textAlign: "center",
                      color: colors.primary.paragraph
                    }}
                  >
                    {settings.mode === "lines"
                      ? `${settings.maxLines}`
                      : `${settings.fontSizePt}pt`}
                  </span>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => adjustStep(1)}
                    style={{
                      padding: "4px",
                      border: `1px solid ${colors.primary.border}`,
                      borderRadius: "6px",
                      display: "inline-flex",
                      backgroundColor: colors.secondary.background,
                      cursor: "pointer"
                    }}
                  >
                    <MdiIcon path={mdiPlus} size="14px" color={iconColor} />
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: colors.primary.paragraph,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.wholeBlocksOnly}
                    style={{ accentColor: colors.primary.accent }}
                    onChange={(e) =>
                      updateSettings({ wholeBlocksOnly: e.target.checked })
                    }
                  />
                  <span>Keep whole service blocks</span>
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                    color: colors.primary.paragraph,
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.removeEmptyLines}
                    style={{ accentColor: colors.primary.accent }}
                    onChange={(e) =>
                      updateSettings({ removeEmptyLines: e.target.checked })
                    }
                  />
                  <span>Remove blank lines</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
