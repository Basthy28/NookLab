import { describe, expect, it } from "vitest";
import { VirtualizedGrouping } from "../../../packages/core/src/utils/virtualized-grouping";
import { filterPromotedTools } from "../../../packages/editor-mobile/src/common/nooklab-toolbar-helpers";
import { buildImageGalleryPayload } from "../../../packages/editor/src/extensions/image/gallery";
import { getPosition } from "../../../packages/ui/src/utils/position";

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

  it("populates missing batch data when VirtualizedGrouping.item is later called with operate", async () => {
    const items = [
      { id: "n1", type: "searchResult" as const },
      { id: "n2", type: "searchResult" as const }
    ];
    let fetchCount = 0;
    const grouping = new VirtualizedGrouping<any>(
      items.length,
      20,
      async () => items.map((i) => i.id),
      async () => {
        fetchCount++;
        return { ids: items.map((i) => i.id), items };
      }
    );

    const first = await grouping.item(0);
    expect(first.item?.id).toBe("n1");
    expect((first as any).data).toBeUndefined();
    expect(fetchCount).toBe(1);

    const resolved = await grouping.item(1, async (ids) =>
      ids.map((id) => ({ color: { colorCode: "#dc2626", id } }))
    );
    expect(fetchCount).toBe(1);
    expect((resolved.data as any)?.color?.colorCode).toBe("#dc2626");
  });

  it("anchors toolbar popover beneath viewport coordinates when isTargetAbsolute is true", () => {
    const button = document.createElement("button");
    Object.defineProperty(button, "offsetLeft", { value: 180 });
    Object.defineProperty(button, "offsetTop", { value: 36 });
    button.getBoundingClientRect = () =>
      ({
        x: 760,
        y: 120,
        width: 28,
        height: 28,
        top: 120,
        left: 760,
        right: 788,
        bottom: 148,
        toJSON: () => ({})
      }) as DOMRect;

    const popup = document.createElement("div");
    Object.defineProperty(popup, "offsetWidth", { value: 240 });
    Object.defineProperty(popup, "offsetHeight", { value: 200 });

    const parent = { clientWidth: 1440, clientHeight: 900 } as HTMLElement;
    const pos = getPosition(popup, {
      isTargetAbsolute: true,
      target: button,
      align: "start",
      location: "below",
      yOffset: 6,
      parent
    });

    expect(pos).toEqual({ left: 760, top: 154 });
  });
});
