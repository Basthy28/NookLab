/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { ThemeUIStyleObject } from "@theme-ui/core";
import { Box, Flex, Image, Text } from "@theme-ui/components";
import { ImageAttributes } from "./image.js";
import { useEffect, useRef, useState } from "react";
import { ReactNodeViewProps } from "../react/index.js";
import { DesktopOnly } from "../../components/responsive/index.js";
import { Icon } from "@notesnook/ui";
import { Icons } from "../../toolbar/icons.js";
import { ToolbarGroup } from "../../toolbar/components/toolbar-group.js";
import { useToolbarStore } from "../../toolbar/stores/toolbar-store.js";
import { Resizer } from "../../components/resizer/index.js";
import {
  corsify,
  downloadImage,
  revokeBloburl,
  toBlobURL,
  toDataURL
} from "../../utils/downloader.js";
import { useObserver } from "../../hooks/use-observer.js";
import { Attachment, ImageAlignmentOptions } from "../attachment/index.js";
import { DataURL } from "@notesnook/common";
import { buildImageGalleryPayload } from "./gallery.js";

export function ImageComponent(
  props: ReactNodeViewProps<Partial<ImageAttributes>>
) {
  const { editor, node, selected, getPos } = props;
  const { src, alt, title, textDirection, hash, aspectRatio, mime, progress } =
    node.attrs;
  const [bloburl, setBloburl] = useState<string | undefined>(
    toBlobURL("", "image", mime, hash)
  );
  const [resizing, setResizing] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const controllerRef = useRef(new AbortController());
  const isMobile = useToolbarStore((store) => store.isMobile);
  const lastPreviewAtRef = useRef(0);

  const { inView, ref: imageRef } = useObserver<HTMLImageElement>({
    threshold: 0.2,
    once: true
  });

  const openPreview = () => {
    const { hash, src } = node.attrs;
    if (!hash && !src) return;
    const now = Date.now();
    if (now - lastPreviewAtRef.current < 350) return;
    lastPreviewAtRef.current = now;

    let pos: number | undefined;
    try {
      pos = typeof getPos === "function" ? getPos() : undefined;
    } catch {
      pos = undefined;
    }

    if (isMobile) {
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      editor.commands.blur();
    }

    editor.storage.previewAttachment?.(
      buildImageGalleryPayload(editor, node.attrs, pos)
    );
  };

  const openPreviewRef = useRef(openPreview);
  openPreviewRef.current = openPreview;

  useEffect(() => {
    if (!isMobile) return;
    const imgEl = imageRef.current;
    if (!imgEl) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let moved = false;
    let longPressed = false;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        moved = true;
        clearTimer();
        return;
      }
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      moved = false;
      longPressed = false;

      clearTimer();
      longPressTimer = setTimeout(() => {
        longPressed = true;
        try {
          const pos = typeof getPos === "function" ? getPos() : undefined;
          if (typeof pos === "number") {
            editor.chain().setNodeSelection(pos).run();
          }
        } catch {
          /* ignore */
        }
      }, 480);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        moved = true;
        clearTimer();
        return;
      }
      const touch = e.touches[0];
      if (
        Math.abs(touch.clientX - startX) > 10 ||
        Math.abs(touch.clientY - startY) > 10
      ) {
        moved = true;
        clearTimer();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      clearTimer();
      if (moved || longPressed) return;
      if (Date.now() - startTime > 450) return;

      // Prevent Android WebView from synthesizing mousedown/click onto contenteditable
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      openPreviewRef.current();
    };

    imgEl.addEventListener("touchstart", onTouchStart, { passive: true });
    imgEl.addEventListener("touchmove", onTouchMove, { passive: true });
    imgEl.addEventListener("touchend", onTouchEnd, { passive: false });
    imgEl.addEventListener("touchcancel", clearTimer, { passive: true });

    return () => {
      clearTimer();
      imgEl.removeEventListener("touchstart", onTouchStart);
      imgEl.removeEventListener("touchmove", onTouchMove);
      imgEl.removeEventListener("touchend", onTouchEnd);
      imgEl.removeEventListener("touchcancel", clearTimer);
    };
  }, [isMobile, bloburl, src, editor, getPos, imageRef]);

  const dom = editor.view.dom;

  const size =
    editor.view.dom.clientWidth === 0
      ? node.attrs
      : clampSize(node.attrs, dom.clientWidth, aspectRatio);

  let align = node.attrs.align;
  if (!align) align = textDirection ? "right" : "left";

  const downloadOptions = useToolbarStore((store) => store.downloadOptions);
  const isReadonly = !editor.isEditable;
  const isSVG = !!mime && mime.includes("/svg");

  useEffect(() => {
    if (!inView) return;
    if (src || !hash || bloburl) return;
    (async function () {
      const { hash } = node.attrs;
      if (hash) {
        const data = await editor.storage
          .getAttachmentData?.({
            type: "image",
            hash
          })
          .catch(() => null);
        if (typeof data !== "string" || !data) return; // TODO: show error

        setBloburl(toBlobURL(data, "image", node.attrs.mime, hash));
      }
    })();
  }, [inView]);

  useEffect(() => {
    const controller = controllerRef.current;
    return () => {
      controller.abort();
      if (hash) revokeBloburl(hash);
    };
  }, []);

  return (
    <>
      <Box
        className="image-container"
        sx={{
          ...getAlignmentStyles(node.attrs),
          position: "relative",
          mt: isSVG ? `24px` : 0,
          ":hover .drag-handle, :active .drag-handle": {
            opacity: 1
          }
        }}
      >
        <Resizer
          style={{ marginTop: 5 }}
          enabled={editor.isEditable}
          selected={selected}
          width={size.width}
          height={bloburl || src ? undefined : size.height}
          onResize={(width, height) => {
            setResizing({ width, height });
          }}
          onResizeStop={(width, height) => {
            setResizing(null);
            editor.commands.setImageSize({ width, height });
          }}
        >
          <DesktopOnly>
            {selected && (
              <Flex
                sx={{
                  position: "absolute",
                  top: -40,
                  right: 0,
                  mb: 2,
                  alignItems: "end",
                  zIndex: 999
                }}
              >
                <ToolbarGroup
                  editor={editor}
                  groupId="imageTools"
                  tools={
                    isReadonly
                      ? [
                          hash ? "previewAttachment" : "none",
                          hash ? "downloadAttachment" : "none"
                        ]
                      : [
                          hash ? "previewAttachment" : "none",
                          hash ? "downloadAttachment" : "none",
                          "imageAlignLeft",
                          "imageAlignCenter",
                          "imageAlignRight",
                          "imageProperties"
                        ]
                  }
                  sx={{
                    boxShadow: "menu",
                    borderRadius: "default",
                    bg: "background"
                  }}
                />
              </Flex>
            )}
            {Boolean(resizing) && (
              <Box
                sx={{
                  position: "absolute",
                  top: -30,
                  left: 0,
                  zIndex: 9999,
                  background: "var(--background-secondary)",
                  px: 2,
                  py: 1,
                  borderRadius: "default"
                }}
              >
                <Text variant="subBody" sx={{ fontWeight: "bold" }}>
                  {resizing?.width}
                  {" × "}
                  {resizing?.height}
                </Text>
              </Box>
            )}
          </DesktopOnly>
          {progress ? (
            <Flex
              sx={{
                position: "absolute",
                bottom: 2,
                right: 2,
                bg: "background",
                borderRadius: 100,
                p: 1,
                px: 2,
                border: "1px solid var(--border)",
                zIndex: 2
              }}
            >
              <Icon path={Icons.loading} rotate size={14} sx={{ mr: 1 }} />
              <Text variant="body">{progress}%</Text>
            </Flex>
          ) : null}
          {!isReadonly && selected && (
            <Icon
              className="drag-handle"
              data-drag-handle
              draggable
              path={Icons.dragHandle}
              color="black"
              sx={{
                cursor: "grab",
                position: "absolute",
                top: 1,
                left: 1,
                zIndex: 999
              }}
            />
          )}
          {isSVG ? (
            <Box
              sx={{
                width: "100%",
                display: editor.isEditable ? "flex" : "none",
                position: "absolute",
                top: -24,
                height: 24,
                justifyContent: "end",
                p: "small",
                bg: editor.isEditable
                  ? "var(--background-secondary)"
                  : "transparent",
                borderTopLeftRadius: "default",
                borderTopRightRadius: "default",
                borderColor: selected ? "border" : "var(--border-secondary)",
                cursor: "pointer",
                ":hover": {
                  borderColor: "border"
                }
              }}
            ></Box>
          ) : null}

          {!src && !bloburl && hash && (
            <Flex
              sx={{
                position: "absolute",
                top: 0,
                left: 0,
                width: editor.isEditable ? "100%" : size.width,
                height: editor.isEditable ? "100%" : size.height,
                bg: "background-secondary",
                border: selected
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                borderRadius: "default",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                // mt: 1,
                py: 50
              }}
            >
              <Icon
                path={Icons.image}
                size={size.width ? size.width * 0.2 : 72}
                color="gray"
              />
            </Flex>
          )}
          <Image
            as={isSVG ? "iframe" : "img"}
            data-drag-image
            ref={imageRef}
            alt={alt}
            crossOrigin="anonymous"
            {...(isSVG
              ? {
                  src: bloburl || corsify(src, downloadOptions?.corsHost),
                  type: mime,
                  sandbox: ""
                }
              : {
                  src: bloburl || corsify(src, downloadOptions?.corsHost)
                })}
            title={title}
            sx={{
              animation: bloburl || src ? "0.2s ease-in 0s 1 fadeIn" : "none",
              objectFit: "contain",
              width: editor.isEditable ? "100%" : size.width,
              height: editor.isEditable ? "100%" : size.height,
              border: selected
                ? "2px solid var(--accent) !important"
                : "2px solid transparent !important",
              borderRadius: "default",
              ...(isSVG ? { bg: "transparent" } : {})
            }}
            onMouseDown={(e) => {
              if (isMobile) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              if (!isMobile) return;
              e.preventDefault();
              e.stopPropagation();
              openPreview();
            }}
            onDoubleClick={() => {
              if (isMobile) return;
              openPreview();
            }}
            onLoad={async function onLoad() {
              if (!imageRef.current) return;

              const { naturalWidth, naturalHeight, clientHeight, clientWidth } =
                imageRef.current;
              const originalWidth = naturalWidth || clientWidth;
              const originalHeight = naturalHeight || clientHeight;
              const naturalAspectRatio = originalWidth / originalHeight;
              const fixedDimensions = fixAspectRatio(
                size.width ?? originalWidth,
                naturalAspectRatio
              );

              if (src && !DataURL.isValid(src) && canParse(src)) {
                const image = await downloadImage(src, {
                  ...downloadOptions,
                  signal: controllerRef.current.signal
                }).catch(console.error);
                if (!image || !imageRef.current) return;

                const { url, size, blob, mimeType } = image;
                imageRef.current.src = url;
                const dataurl = await toDataURL(blob);
                await editor.threadsafe((editor) =>
                  editor.commands.updateAttachment(
                    {
                      ...fixedDimensions,
                      src: dataurl,
                      size: size,
                      mime: mimeType,
                      aspectRatio: naturalAspectRatio
                    },
                    { query: makeImageQuery(src, hash) }
                  )
                );
              } else if (!aspectRatio || aspectRatio != naturalAspectRatio) {
                await editor.threadsafe((editor) =>
                  editor.commands.updateAttachment(
                    {
                      ...fixedDimensions,
                      aspectRatio: naturalAspectRatio
                    },
                    { query: makeImageQuery(src, hash), ignoreEdit: true }
                  )
                );
              } else if (size.height !== fixedDimensions.height) {
                await editor.threadsafe((editor) =>
                  editor.commands.updateAttachment(fixedDimensions, {
                    query: makeImageQuery(src, hash),
                    ignoreEdit: true
                  })
                );
              }
            }}
          />
        </Resizer>
        {/* )} */}
      </Box>
    </>
  );
}

function makeImageQuery(src?: string, hash?: string) {
  return (a: Attachment) =>
    a.type === "image" &&
    ((!!a.src && !!src && a.src === src) ||
      (!!a.hash && !!hash && a.hash === hash));
}
function canParse(src: string) {
  if (!src) return false;
  try {
    return !!new URL(src);
  } catch {
    return false;
  }
}

function clampSize(
  size: { width?: number; height?: number },
  maxWidth: number,
  aspectRatio?: number
): { width: number; height: number } {
  if (typeof aspectRatio === "string" && isNaN(aspectRatio)) aspectRatio = 1;

  // if no size we set the image to maximum size.
  if (!size.width || !size.height) return { width: maxWidth, height: maxWidth };

  if (!aspectRatio) aspectRatio = size.width / size.height;

  if (size.width > maxWidth)
    return { width: maxWidth, height: maxWidth / aspectRatio };

  return {
    height: size.height,
    width: size.width
  };
}

function fixAspectRatio(width: number, aspectRatio: number) {
  return {
    width,
    height: width / aspectRatio
  };
}

function getAlignmentStyles(
  options: ImageAlignmentOptions
): ThemeUIStyleObject {
  const { align, float } = options;
  if (float && align !== "center") {
    return {
      ml: align === "right" ? 2 : 0,
      mr: align === "left" ? 2 : 0,
      float: align,
      justifyContent: "stretch"
    };
  }

  return {
    display: "flex",
    justifyContent:
      align === "center" ? "center" : align === "right" ? "end" : "start"
  };
}
