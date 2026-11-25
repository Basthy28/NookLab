import { describe, expect, it } from "vitest";
import { filterPromotedTools } from "../../../packages/editor-mobile/src/common/nooklab-toolbar-helpers";
import { buildImageGalleryPayload } from "../../../packages/editor/src/extensions/image/gallery";

describe("NookLab mobile editor toolbar and image gallery helpers", () => {
  it("removes promoted color tools from top bar definitions without mutating source", () => {
    const source: any = [
      ["bold", "italic", ["strikethrough", "textColor", "highlight"]],
      ["textColor"]
    ];
    const filtered = filterPromotedTools(source);
    expect(filtered).toEqual([["bold", "italic", ["strikethrough"]]]);
    expect(source[0][2]).toEqual(["strikethrough", "textColor", "highlight"]);
  });

  it("collects all note images in document order and tracks tapped index", () => {
    const fakeDoc = {
      descendants(
        cb: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void
      ) {
        cb({ type: { name: "paragraph" }, attrs: {} }, 0);
        cb(
          {
            type: { name: "image" },
            attrs: { hash: "img1", filename: "a.jpg", mime: "image/jpeg", size: 100 }
          },
          5
        );
        cb(
          {
            type: { name: "image" },
            attrs: { hash: "img2", filename: "b.png", mime: "image/png", size: 200 }
          },
          12
        );
        cb(
          {
            type: { name: "image" },
            attrs: { hash: "img1", filename: "a.jpg", mime: "image/jpeg", size: 100 }
          },
          20
        );
      }
    };

    const payload = buildImageGalleryPayload(
      { state: { doc: fakeDoc } } as any,
      { hash: "img1", filename: "a.jpg", mime: "image/jpeg", size: 100 },
      20
    );

    expect(payload.galleryImages).toHaveLength(3);
    expect(payload.galleryImages?.map((i) => i.hash)).toEqual(["img1", "img2", "img1"]);
    expect(payload.currentIndex).toBe(2);
  });
});
