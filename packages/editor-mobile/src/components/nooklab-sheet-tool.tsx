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
          backgroundColor: isOpen
            ? "var(--background-selected)"
            : "transparent"
        }}
      >
        <MdiIcon
          path={mdiFileDocumentOutline}
          size="20px"
          color={isOpen ? "var(--icon-selected)" : "var(--icon)"}
        />
        <MdiIcon
          path={mdiChevronDown}
          size="13px"
          color={isOpen ? "var(--icon-selected)" : "var(--icon)"}
        />
      </button>

      {isOpen ? (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0, 0, 0, 0.35)",
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
              backgroundColor: "var(--background)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              boxShadow: "0 -4px 24px rgba(0, 0, 0, 0.3)",
              color: "var(--paragraph)"
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
                  color="var(--accent)"
                />
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "var(--heading)"
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
                      backgroundColor: "var(--background-secondary)",
                      border: "1px solid var(--border)",
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--paragraph)"
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
                  <MdiIcon path={mdiClose} size="16px" color="var(--icon)" />
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
                  backgroundColor: "var(--background-secondary)",
                  borderRadius: "8px",
                  border: "1px solid var(--border)"
                }}
              >
                <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--icon)",
                      minWidth: "36px"
                    }}
                  >
                    Start:
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "var(--paragraph)",
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
                      color: "var(--icon)",
                      minWidth: "36px"
                    }}
                  >
                    End:
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--paragraph)",
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
                  color: "var(--icon)",
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
                  backgroundColor: "var(--accent)",
                  color: "var(--accentForeground)",
                  opacity: !preview || preview.lineCount === 0 ? 0.5 : 1
                }}
              >
                <MdiIcon
                  path={mdiContentCopy}
                  size="16px"
                  color="var(--accentForeground)"
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
                  border: "1px solid var(--border)",
                  cursor: "pointer",
                  backgroundColor: "var(--background-secondary)",
                  color: "var(--paragraph)",
                  opacity: !preview || preview.lineCount === 0 ? 0.5 : 1
                }}
              >
                <MdiIcon path={mdiContentCopy} size="15px" color="var(--icon)" />
                <span>Copy all clean</span>
              </button>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                paddingTop: "8px",
                borderTop: "1px solid var(--separator)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  backgroundColor: "var(--background-secondary)",
                  padding: "3px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
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
                        backgroundColor: active ? "var(--accent)" : "transparent",
                        color: active
                          ? "var(--accentForeground)"
                          : "var(--paragraph)"
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
                <span style={{ fontSize: "12px", color: "var(--icon)" }}>
                  {settings.mode === "lines" ? "Max lines" : "Font size"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <button
                    type="button"
                    onMouseDown={preventFocusLoss}
                    onClick={() => adjustStep(-1)}
                    style={{
                      padding: "4px",
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      display: "inline-flex",
                      backgroundColor: "var(--background-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    <MdiIcon path={mdiMinus} size="14px" color="var(--icon)" />
                  </button>
                  <span
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      minWidth: "46px",
                      textAlign: "center",
                      color: "var(--paragraph)"
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
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      display: "inline-flex",
                      backgroundColor: "var(--background-secondary)",
                      cursor: "pointer"
                    }}
                  >
                    <MdiIcon path={mdiPlus} size="14px" color="var(--icon)" />
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
                    color: "var(--paragraph)",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.wholeBlocksOnly}
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
                    color: "var(--paragraph)",
                    cursor: "pointer"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={settings.removeEmptyLines}
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
