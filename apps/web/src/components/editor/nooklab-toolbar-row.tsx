/*
 * NookLab — expanded second row for the editor toolbar.
 *
 * Kept in an isolated file to minimize upstream diffs in tiptap.tsx and avoid
 * mutating synced toolbarConfig settings across official Notesnook clients.
 */
import {
  Editor,
  findTool,
  getToolDefinition,
  Icons,
  ToolbarDefinition,
  ToolId
} from "@notesnook/editor";
import { strings } from "@notesnook/intl";
import { Icon } from "@notesnook/ui";
import { Button, Flex } from "@theme-ui/components";
import {
  NOOKLAB_AUTOCORRECT_ICON,
  toggleAutocorrect,
  useAutocorrectEnabled
} from "../../common/nooklab-autocorrect";
import { NookLabNoteColorTool } from "./nooklab-note-color-tool";
import { NookLabSheetTool } from "./nooklab-sheet-tool";

const PROMOTED_TOOL_IDS = new Set<ToolId>(["textColor", "highlight"]);

/**
 * Strip promoted tools from the top toolbar row in memory so they are not
 * hidden in the More popup or rendered twice with colliding popup IDs.
 */
export function filterPromotedTools(
  tools?: ToolbarDefinition
): ToolbarDefinition | undefined {
  if (!tools) return tools;
  return tools
    .map((group) =>
      group
        .map((item) =>
          Array.isArray(item)
            ? item.filter((id) => !PROMOTED_TOOL_IDS.has(id))
            : item
        )
        .filter((item) =>
          Array.isArray(item) ? item.length > 0 : !PROMOTED_TOOL_IDS.has(item)
        )
    )
    .filter((group) => group.length > 0);
}

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
    <Button
      variant="secondary"
      id={id}
      title={title}
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      sx={{
        height: "unset",
        flexShrink: 0,
        p: 1,
        borderRadius: "default",
        m: 0,
        bg: active ? "background-selected" : "transparent"
      }}
    >
      <Icon
        path={iconPath}
        color={active ? "icon-selected" : "icon"}
        size="big"
      />
    </Button>
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
    <Flex
      className="nooklab-toolbar-row"
      data-test-id="nooklab-toolbar-row"
      sx={{
        alignItems: "center",
        flexWrap: "wrap",
        bg: "background",
        borderTop: "1px solid var(--separator)"
      }}
    >
      <Flex
        className="toolbar-group"
        sx={{
          gap: [0, 0, "small"],
          p: ["4px", "4px", "small"],
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
      </Flex>
      <Flex
        className="toolbar-group"
        sx={{
          gap: [0, 0, "small"],
          p: ["4px", "4px", "small"],
          flexShrink: 0,
          alignItems: "center"
        }}
      >
        {directActions.map((action) => (
          <DirectToolButton key={action.id} {...action} />
        ))}
        <NookLabNoteColorTool />
        <NookLabSheetTool editor={editor} />
      </Flex>
    </Flex>
  );
}
