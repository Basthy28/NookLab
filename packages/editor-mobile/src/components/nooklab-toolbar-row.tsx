/*
 * NookLab — slim second bottom toolbar row for mobile WebView editor.
 * Promotes Text Color, Highlight, Horizontal Rule, Attachment, PT-PT/EN
 * Autocorrect, and Service Sheet to 1 tap right below the primary toolbar.
 */
import MdiIcon from "@mdi/react";
import {
  Editor,
  findTool,
  getToolDefinition,
  Icons,
  ToolId
} from "@notesnook/editor";
import { strings } from "@notesnook/intl";
import { useThemeColors } from "@notesnook/theme";
import React from "react";
import {
  NOOKLAB_AUTOCORRECT_ICON,
  toggleAutocorrect,
  useAutocorrectEnabled
} from "../common/nooklab-autocorrect";
import { useTabNoteColor } from "../common/nooklab-note-color";
export { filterPromotedTools } from "../common/nooklab-toolbar-helpers";
import { useTabContext } from "../hooks/useTabStore";
import { EditorEvents } from "../utils/editor-events";
import { NookLabSheetTool } from "./nooklab-sheet-tool";

type DirectToolButtonProps = {
  id: string;
  title: string;
  iconPath: string;
  active: boolean;
  iconColor: string;
  activeIconColor: string;
  activeBackground: string;
  onClick: () => void;
};

function DirectToolButton({
  id,
  title,
  iconPath,
  active,
  iconColor,
  activeIconColor,
  activeBackground,
  onClick
}: DirectToolButtonProps) {
  return (
    <button
      type="button"
      id={id}
      title={title}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        height: "28px",
        flexShrink: 0,
        padding: "4px",
        borderRadius: "6px",
        border: "none",
        margin: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        backgroundColor: active ? activeBackground : "transparent"
      }}
    >
      <MdiIcon
        path={iconPath}
        size="20px"
        color={active ? activeIconColor : iconColor}
      />
    </button>
  );
}

export function NookLabToolbarRow({ editor }: { editor: Editor }) {
  const { colors } = useThemeColors("editorToolbar");
  const autocorrectEnabled = useAutocorrectEnabled();
  const tab = useTabContext();
  const noteColor = useTabNoteColor(tab.id);
  if (!editor.isEditable) return null;

  const TextColorTool = findTool("textColor");
  const textColorDef = getToolDefinition("textColor");
  const HighlightTool = findTool("highlight");
  const highlightDef = getToolDefinition("highlight");

  const iconColor = colors.primary.icon;
  const activeIconColor = colors.selected.icon || colors.primary.accent;
  const activeBackground = colors.selected.background;

  const directActions: Omit<
    DirectToolButtonProps,
    "iconColor" | "activeIconColor" | "activeBackground"
  >[] = [
    {
      id: "tool-nooklab-horizontal-rule",
      title: strings.horizontalRule(),
      iconPath: Icons.horizontalRule,
      active: editor.isActive("horizontalRule"),
      onClick: () => editor.chain().focus().setHorizontalRule().run()
    },
    {
      id: "tool-nooklab-attachment",
      title: strings.addAttachment(),
      iconPath: Icons.attachment,
      active: editor.isActive("attachment"),
      onClick: () => editor.storage.openAttachmentPicker?.("file")
    },
    {
      id: "tool-nooklab-autocorrect",
      title: "Autocorrect (PT-PT / EN)",
      iconPath: NOOKLAB_AUTOCORRECT_ICON,
      active: autocorrectEnabled,
      onClick: () => toggleAutocorrect()
    }
  ];

  return (
    <div
      className="nooklab-toolbar-row theme-scope-editorToolbar"
      data-test-id="nooklab-toolbar-row"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        overflowX: "auto",
        minHeight: "36px",
        backgroundColor: colors.primary.background,
        color: colors.primary.paragraph,
        borderTop: `1px solid ${colors.primary.separator || colors.primary.border}`
      }}
    >
      <div
        className="toolbar-group"
        style={{
          display: "flex",
          gap: "2px",
          padding: "2px 4px",
          flexShrink: 0,
          alignItems: "center",
          borderRight: `1px solid ${colors.primary.separator || colors.primary.border}`
        }}
      >
        <TextColorTool
          parentGroup="nooklab-colors"
          editor={editor}
          {...textColorDef}
        />
        <HighlightTool
          parentGroup="nooklab-colors"
          editor={editor}
          {...highlightDef}
        />
      </div>
      <div
        className="toolbar-group"
        style={{
          display: "flex",
          gap: "2px",
          padding: "2px 4px",
          flexShrink: 0,
          alignItems: "center"
        }}
      >
        {directActions.map((action) => (
          <DirectToolButton
            key={action.id}
            {...action}
            iconColor={iconColor}
            activeIconColor={activeIconColor}
            activeBackground={activeBackground}
          />
        ))}
        <button
          type="button"
          id="tool-nooklab-note-color"
          title={
            noteColor?.title ? `Note color: ${noteColor.title}` : "Note color"
          }
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() =>
            post(EditorEvents.noteColor, null, tab.id, tab.session?.noteId)
          }
          style={{
            height: "28px",
            width: "28px",
            flexShrink: 0,
            padding: "4px",
            borderRadius: "6px",
            border: "none",
            margin: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            backgroundColor: "transparent"
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "4px",
              display: "inline-block",
              backgroundColor: noteColor?.colorCode || "transparent",
              border: noteColor?.colorCode
                ? `1.5px solid ${colors.primary.border || "rgba(255,255,255,0.4)"}`
                : `2px solid ${iconColor}`
            }}
          />
        </button>
        <NookLabSheetTool editor={editor} />
      </div>
    </div>
  );
}
