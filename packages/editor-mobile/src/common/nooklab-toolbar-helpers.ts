/*
 * NookLab — pure toolbar filtering helper for mobile editor rows.
 */
import type { ToolbarDefinition, ToolId } from "@notesnook/editor";

export const PROMOTED_MOBILE_TOOL_IDS = new Set<ToolId>([
  "textColor",
  "highlight"
]);

/**
 * Strip tools already promoted to the secondary mobile row without mutating
 * the caller's toolbar configuration array.
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
            ? item.filter((id) => !PROMOTED_MOBILE_TOOL_IDS.has(id))
            : item
        )
        .filter((item) =>
          Array.isArray(item)
            ? item.length > 0
            : !PROMOTED_MOBILE_TOOL_IDS.has(item)
        )
    )
    .filter((group) => group.length > 0);
}
