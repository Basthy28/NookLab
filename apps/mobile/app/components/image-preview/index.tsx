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

import Sodium from "@ammarahmed/react-native-sodium";
import { DataURL, getFileNameWithExtension } from "@notesnook/core";
import type { ImageAttributes } from "@notesnook/editor";
import { strings } from "@notesnook/intl";
import { useThemeColors } from "@notesnook/theme";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, Image, Platform, View } from "react-native";
import RNFetchBlob from "react-native-blob-util";
import FileViewer from "react-native-file-viewer";
import ImageViewer from "react-native-image-zoom-viewer";
import Share from "react-native-share";
import { DatabaseLogger, db } from "../../common/database";
import downloadAttachment from "../../common/filesystem/download-attachment";
import { cacheDir } from "../../common/filesystem/utils";
import useGlobalSafeAreaInsets from "../../hooks/use-global-safe-area-insets";
import {
  eSubscribeEvent,
  eUnSubscribeEvent,
  ToastManager
} from "../../services/event-manager";
import { DefaultAppStyles } from "../../utils/styles";
import BaseDialog from "../dialog/base-dialog";
import { IconButton } from "../ui/icon-button";
import { ProgressBarComponent } from "../ui/svg/lazy";
import Paragraph from "../ui/typography/paragraph";

type ResolvedSlide = {
  uri?: string;
  width: number;
  height: number;
  filename?: string;
  failed?: boolean;
};

function computeFallbackSize(
  item: ImageAttributes,
  screenWidth: number,
  screenHeight: number
): { width: number; height: number } {
  const maxHeight = screenHeight * 0.88;
  const aspectRatio =
    item.aspectRatio && item.aspectRatio > 0
      ? item.aspectRatio
      : item.width && item.height && item.height > 0
        ? item.width / item.height
        : 4 / 3;

  let width = screenWidth;
  let height = width / aspectRatio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  return {
    width: Math.max(120, Math.round(width)),
    height: Math.max(120, Math.round(height))
  };
}

function measureImageSize(
  uri: string
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    Image.getSize(
      uri,
      (width, height) => {
        resolve(width > 0 && height > 0 ? { width, height } : null);
      },
      () => resolve(null)
    );
  });
}

const ImagePreview = () => {
  const { colors } = useThemeColors("dialog");
  const insets = useGlobalSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

  const [visible, setVisible] = useState(false);
  const [galleryItems, setGalleryItems] = useState<ImageAttributes[]>([]);
  const [initialIndex, setInitialIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolvedSlides, setResolvedSlides] = useState<
    Record<number, ResolvedSlide>
  >({});
  const [loading, setLoading] = useState(false);
  const [showHeader, setShowHeader] = useState(true);

  const sessionIdRef = useRef(0);
  const tempFilesRef = useRef<Set<string>>(new Set());
  const activeHashesRef = useRef<Set<string>>(new Set());

  const cleanupTempFiles = useCallback(() => {
    const files = Array.from(tempFilesRef.current);
    tempFilesRef.current.clear();
    files.forEach((filePath) => {
      RNFetchBlob.fs.unlink(filePath).catch(() => {
        /* empty */
      });
    });
  }, []);

  const resolveSlide = useCallback(
    async (
      item: ImageAttributes,
      slideIndex: number,
      sessionId: number,
      hashCache: Map<string, ResolvedSlide>
    ): Promise<ResolvedSlide> => {
      const fallback = computeFallbackSize(item, screenWidth, screenHeight);

      let hash = item.hash;
      const inlineData =
        !hash && item.src ? DataURL.toObject(item.src) : undefined;
      if (!hash && inlineData) {
        hash = await Sodium.hashFile({
          data: inlineData.data,
          type: "base64",
          uri: ""
        });
      }

      if (hash && hashCache.has(hash)) {
        const cached = hashCache.get(hash)!;
        return {
          ...cached,
          filename: cached.filename || item.filename
        };
      }

      if (!hash && item.src) {
        if (inlineData) {
          const ext = inlineData.type?.split("/")[1]?.split(";")[0] || "png";
          const outPath = `${cacheDir}/NN_${sessionId}_${slideIndex}.${ext}`;
          await RNFetchBlob.fs.writeFile(outPath, inlineData.data, "base64");
          tempFilesRef.current.add(outPath);
          const fileUri = "file://" + outPath;
          const dims = (await measureImageSize(fileUri)) || fallback;
          return {
            uri: fileUri,
            width: dims.width,
            height: dims.height,
            filename: item.filename
          };
        }

        const dims = (await measureImageSize(item.src)) || fallback;
        return {
          uri: item.src,
          width: dims.width,
          height: dims.height,
          filename: item.filename
        };
      }

      if (!hash) {
        return { ...fallback, failed: true, filename: item.filename };
      }

      activeHashesRef.current.add(hash);
      try {
        //@ts-ignore upstream downloadAttachment typing expects string
        const uri = await downloadAttachment(hash, false, {
          silent: true,
          cache: true
        });
        if (!uri || sessionIdRef.current !== sessionId) {
          return { ...fallback, failed: !uri, filename: item.filename };
        }

        const attachment = await db.attachments.attachment(hash);
        const extName = await getFileNameWithExtension(
          hash,
          attachment?.mimeType || item.mime
        );
        const targetPath = `${cacheDir}/NN_${sessionId}_${extName}`;
        if (`${cacheDir}/${uri}` !== targetPath) {
          await RNFetchBlob.fs.mv(`${cacheDir}/${uri}`, targetPath).catch(() => {
            /* empty */
          });
        }
        const exists = await RNFetchBlob.fs.exists(targetPath);
        const finalPath = exists ? targetPath : `${cacheDir}/${uri}`;
        tempFilesRef.current.add(finalPath);

        const fileUri = "file://" + finalPath;
        const dims = (await measureImageSize(fileUri)) || fallback;
        const resolved: ResolvedSlide = {
          uri: fileUri,
          width: dims.width,
          height: dims.height,
          filename: attachment?.filename || item.filename
        };
        hashCache.set(hash, resolved);
        return resolved;
      } finally {
        activeHashesRef.current.delete(hash);
      }
    },
    [screenHeight, screenWidth]
  );

  const open = useCallback(
    async (payload: ImageAttributes) => {
      cleanupTempFiles();
      const sessionId = ++sessionIdRef.current;

      const items =
        Array.isArray(payload.galleryImages) && payload.galleryImages.length > 0
          ? payload.galleryImages
          : [payload];
      const clampedStart = Math.max(
        0,
        Math.min(payload.currentIndex ?? 0, items.length - 1)
      );

      setGalleryItems(items);
      setInitialIndex(clampedStart);
      setCurrentIndex(clampedStart);
      setResolvedSlides({});
      setShowHeader(true);
      setVisible(true);
      setLoading(true);

      const hashCache = new Map<string, ResolvedSlide>();

      setTimeout(async () => {
        try {
          if (sessionIdRef.current !== sessionId) return;
          const firstSlide = await resolveSlide(
            items[clampedStart],
            clampedStart,
            sessionId,
            hashCache
          );
          if (sessionIdRef.current !== sessionId) return;

          setResolvedSlides({ [clampedStart]: firstSlide });
          setLoading(false);

          // Preload neighboring slides first, then remaining slides without
          // altering ImageViewer's initial index prop.
          const order: number[] = [];
          for (let offset = 1; offset < items.length; offset++) {
            const right = clampedStart + offset;
            const left = clampedStart - offset;
            if (right < items.length) order.push(right);
            if (left >= 0) order.push(left);
          }

          for (const idx of order) {
            if (sessionIdRef.current !== sessionId) return;
            try {
              const slide = await resolveSlide(
                items[idx],
                idx,
                sessionId,
                hashCache
              );
              if (sessionIdRef.current !== sessionId) return;
              setResolvedSlides((prev) => ({ ...prev, [idx]: slide }));
            } catch (e) {
              DatabaseLogger.error(e);
              const fallback = computeFallbackSize(
                items[idx],
                screenWidth,
                screenHeight
              );
              if (sessionIdRef.current === sessionId) {
                setResolvedSlides((prev) => ({
                  ...prev,
                  [idx]: { ...fallback, failed: true }
                }));
              }
            }
          }
        } catch (e) {
          DatabaseLogger.error(e);
          if (sessionIdRef.current === sessionId) {
            setLoading(false);
            ToastManager.show({
              heading: strings.failToOpen(),
              message: (e as Error)?.message,
              type: "error",
              context: "global"
            });
          }
        }
      }, 40);
    },
    [cleanupTempFiles, resolveSlide, screenHeight, screenWidth]
  );

  useEffect(() => {
    eSubscribeEvent("ImagePreview", open);
    return () => {
      eUnSubscribeEvent("ImagePreview", open);
    };
  }, [open]);

  const close = useCallback(() => {
    sessionIdRef.current++;
    Array.from(activeHashesRef.current).forEach((hash) => {
      db.fs().cancel(hash);
    });
    activeHashesRef.current.clear();
    cleanupTempFiles();
    setGalleryItems([]);
    setResolvedSlides({});
    setLoading(false);
    setVisible(false);
  }, [cleanupTempFiles]);

  const viewerUrls = useMemo(() => {
    return galleryItems.map((item, idx) => {
      const resolved = resolvedSlides[idx];
      const dims = resolved || computeFallbackSize(item, screenWidth, screenHeight);
      return {
        url: resolved?.uri || "",
        width: dims.width,
        height: dims.height,
        props: {
          slideIndex: idx
        }
      };
    });
  }, [galleryItems, resolvedSlides, screenHeight, screenWidth]);

  const renderHeader = useCallback(
    (activeIdx?: number) => {
      const idx = typeof activeIdx === "number" ? activeIdx : currentIndex;
      const total = galleryItems.length;
      const activeSlide = resolvedSlides[idx];
      const activeTitle = activeSlide?.filename || galleryItems[idx]?.filename;

      return (
        <View
          style={{
            paddingTop: insets.top,
            backgroundColor: "rgba(0,0,0,0.45)",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 999,
            display: showHeader ? "flex" : "none"
          }}
        >
          <View
            style={{
              flexDirection: "row",
              width: "100%",
              justifyContent: "space-between",
              alignItems: "center",
              height: 52,
              paddingHorizontal: DefaultAppStyles.GAP,
              gap: 10
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                overflow: "hidden"
              }}
            >
              {total > 1 ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.16)"
                  }}
                >
                  <Paragraph color="white" size={12} style={{ fontWeight: "700" }}>
                    {`${idx + 1} / ${total}`}
                  </Paragraph>
                </View>
              ) : null}
              {activeTitle ? (
                <Paragraph
                  color="rgba(255,255,255,0.85)"
                  size={13}
                  numberOfLines={1}
                  style={{ flex: 1 }}
                >
                  {activeTitle}
                </Paragraph>
              ) : null}
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <IconButton
                name="share"
                color="white"
                style={{
                  borderWidth: 0,
                  opacity: activeSlide?.uri ? 1 : 0.4
                }}
                onPress={async () => {
                  const uri = activeSlide?.uri;
                  if (!uri) return;

                  try {
                    if (Platform.OS === "android") {
                      await FileViewer.open(uri.replace("file://", ""), {
                        showOpenWithDialog: true,
                        showAppsSuggestions: true,
                        shareFile: true
                      } as any);
                    } else {
                      await Share.open({ url: uri });
                    }
                  } catch (error) {
                    console.error(error);
                  }
                }}
              />
              <IconButton name="close" color="white" onPress={close} />
            </View>
          </View>
        </View>
      );
    },
    [close, currentIndex, galleryItems, insets.top, resolvedSlides, showHeader]
  );

  const renderSlideImage = useCallback(
    (imgProps: any) => {
      const idx = typeof imgProps?.slideIndex === "number" ? imgProps.slideIndex : 0;
      const slide = resolvedSlides[idx];
      if (!slide?.uri) {
        return (
          <View
            style={[
              imgProps?.style,
              {
                justifyContent: "center",
                alignItems: "center",
                backgroundColor: "transparent"
              }
            ]}
          >
            {slide?.failed ? (
              <Paragraph color="rgba(255,255,255,0.75)" size={13}>
                {strings.failToOpen()}
              </Paragraph>
            ) : (
              <ProgressBarComponent
                indeterminate
                color={colors.primary.accent}
                borderColor="transparent"
              />
            )}
          </View>
        );
      }

      return (
        <Image
          source={{ uri: slide.uri }}
          style={[imgProps?.style, { backgroundColor: "transparent" }]}
          resizeMode="contain"
        />
      );
    },
    [colors.primary.accent, resolvedSlides]
  );

  if (!visible) return null;

  return (
    <BaseDialog
      background="black"
      animation="slide"
      visible={true}
      useSafeArea={false}
      onRequestClose={close}
      transparent
    >
      <View
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "black"
        }}
      >
        {loading || viewerUrls.length === 0 ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center"
            }}
          >
            <ProgressBarComponent
              indeterminate
              color={colors.primary.accent}
              borderColor="transparent"
            />
            <IconButton
              onPress={close}
              style={{
                position: "absolute",
                top: Platform.OS === "android" ? 35 : insets.top,
                right: 12
              }}
              color={colors.static.white}
              name="close"
            />
          </View>
        ) : (
          <ImageViewer
            enableImageZoom={true}
            minScale={1}
            maxOverflow={300}
            doubleClickInterval={250}
            renderIndicator={() => <></>}
            enableSwipeDown
            useNativeDriver
            onSwipeDown={close}
            saveToLocalByLongPress={false}
            index={initialIndex}
            onChange={(index) => {
              if (typeof index === "number") {
                setCurrentIndex(index);
              }
            }}
            onClick={() => {
              setShowHeader((prev) => !prev);
            }}
            renderHeader={renderHeader}
            renderImage={renderSlideImage}
            imageUrls={viewerUrls}
          />
        )}
      </View>
    </BaseDialog>
  );
};

export default ImagePreview;
