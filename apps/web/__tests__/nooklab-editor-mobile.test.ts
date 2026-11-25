import { describe, expect, it } from "vitest";
import { filterPromotedTools } from "../../../packages/editor-mobile/src/common/nooklab-toolbar-helpers";

describe("NookLab mobile editor toolbar helpers", () => {
  it("removes promoted color tools from top bar definitions without mutating source", () => {
    const source: any = [
      ["bold", "italic", ["strikethrough", "textColor", "highlight"]],
      ["textColor"]
    ];
    const filtered = filterPromotedTools(source);
    expect(filtered).toEqual([["bold", "italic", ["strikethrough"]]]);
    expect(source[0][2]).toEqual(["strikethrough", "textColor", "highlight"]);
  });
});
