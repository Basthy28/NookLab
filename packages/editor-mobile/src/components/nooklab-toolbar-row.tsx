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
import React from "react";
import {
  NOOKLAB_AUTOCORRECT_ICON,
  toggleAutocorrect,
  useAutocorrectEnabled
} from "../common/nooklab-autocorrect";
export { filterPromotedTools } from "../common/nooklab-toolbar-helpers";
import { NookLabSheetTool } from "./nooklab-sheet-tool";

type DirectToolButtonProps = {
  id: string;
  title: string;
  iconPath: string;
  active: boolean;
  onClick: () => void;
};

function DirectToolButton({
  id,
  title,
  iconPath,
  active,
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
        backgroundColor: active ? "var(--background-selected)" : "transparent"
      }}
    >
      <MdiIcon
        path={iconPath}
        size="20px"
        color={active ? "var(--icon-selected)" : "var(--icon)"}
      />
    </button>
  );
}

export function NookLabToolbarRow({ editor }: { editor: Editor }) {
  const autocorrectEnabled = useAutocorrectEnabled();
  if (!editor.isEditable) return null;

  const TextColorTool = findTool("textColor");
  const textColorDef = getToolDefinition("textColor");
  const HighlightTool = findTool("highlight");
  const highlightDef = getToolDefinition("highlight");

  const directActions: DirectToolButtonProps[] = [
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
      className="nooklab-toolbar-row"
      data-test-id="nooklab-toolbar-row"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        overflowX: "auto",
        minHeight: "36px",
        backgroundColor: "var(--background)",
        borderTop: "1px solid var(--separator)"
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
          borderRight: "1px solid var(--separator)"
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
          <DirectToolButton key={action.id} {...action} />
        ))}
        <NookLabSheetTool editor={editor} />
      </div>
    </div>
  );
}
