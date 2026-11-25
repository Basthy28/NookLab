/*
 * NookLab — collect all ordered image attachments inside a TipTap document so
 * previewers (especially mobile) can swipe across every photo in the note.
 */
import type { Editor } from "../../types.js";
import type { ImageAttachment } from "../attachment/types.js";

export function toImageAttachmentPayload(
  attrs: Partial<ImageAttachment>
): ImageAttachment {
  return {
    type: "image",
    hash: attrs.hash || "",
    filename: attrs.filename || "",
    mime: attrs.mime || "image/*",
    size: typeof attrs.size === "number" ? attrs.size : 0,
    width: attrs.width,
    height: attrs.height,
    aspectRatio: attrs.aspectRatio,
    src: attrs.src,
    align: attrs.align,
    float: attrs.float
  };
}

export function buildImageGalleryPayload(
  editor: Editor,
  currentAttrs: Partial<ImageAttachment>,
  targetPos?: number
): ImageAttachment {
  const clicked = toImageAttachmentPayload(currentAttrs);
  const images: ImageAttachment[] = [];
  let matchedIndex = -1;

  editor.state.doc.descendants((descNode, pos) => {
    if (descNode.type.name !== "image") return;
    const item = toImageAttachmentPayload(
      descNode.attrs as Partial<ImageAttachment>
    );
    if (!item.hash && !item.src) return;

    const index = images.length;
    images.push(item);

    if (typeof targetPos === "number" && pos === targetPos) {
      matchedIndex = index;
    } else if (
      matchedIndex === -1 &&
      ((clicked.hash && item.hash === clicked.hash) ||
        (!clicked.hash && clicked.src && item.src === clicked.src))
    ) {
      matchedIndex = index;
    }
  });

  if (images.length === 0) {
    return clicked;
  }

  return {
    ...clicked,
    galleryImages: images,
    currentIndex: matchedIndex >= 0 ? matchedIndex : 0
  };
}
