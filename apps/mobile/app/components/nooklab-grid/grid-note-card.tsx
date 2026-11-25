/*
 * NookLab — ColorNote-style note card for 2-column mobile Grid View.
 */
import { getFormattedDate, TagsWithDateEdited } from "@notesnook/common";
import type { Color, HighlightedResult, Match, Note, Reminder } from "@notesnook/core";
import { isReminderActive } from "@notesnook/core";
import { useThemeColors } from "@notesnook/theme";
import dayjs from "dayjs";
import React from "react";
import { Pressable, View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { notesnook } from "../../../e2e/test.ids";
import { db } from "../../common/database";
import useIsSelected from "../../hooks/use-selected";
import { useTabStore } from "../../screens/editor/tiptap/use-tab-store";
import { eSendEvent } from "../../services/event-manager";
import { useSelectionStore } from "../../stores/use-selection-store";
import { eOnLoadNote } from "../../utils/events";
import { fluidTabsRef } from "../../utils/global-refs";
import { AppFontSize } from "../../utils/size";
import { openNote } from "../list-items/note/wrapper";
import { selectItem } from "../list-items/selection-wrapper";
import { Properties } from "../properties";
import AppIcon from "../ui/AppIcon";
import Paragraph from "../ui/typography/paragraph";
import {
  mixHexColor,
  NOOKLAB_GRID_CARD_HEIGHT,
  withHexAlpha
} from "./grid-helpers";
import { useNotePreview } from "./note-preview";

type GridNoteCardProps = {
  item: Note | HighlightedResult;
  index: number;
  date: number;
  color?: Color;
  tags?: TagsWithDateEdited;
  reminder?: Reminder;
  attachmentsCount: number;
  locked?: boolean;
};

function renderHighlightedTokens(
  tokens: Match[],
  accentBg: string,
  accentFg: string,
  keyPrefix: string
) {
  return tokens.map((token, idx) => (
    <React.Fragment key={`${keyPrefix}-${token.id}-${idx}`}>
      {token.prefix}
      <Paragraph
        style={{
          backgroundColor: accentBg,
          color: accentFg,
          fontWeight: "700"
        }}
      >
        {token.match}
      </Paragraph>
      {token.suffix}
    </React.Fragment>
  ));
}

export const GridNoteCard = React.memo(
  function GridNoteCard({
    item,
    index,
    date,
    color,
    tags,
    reminder,
    attachmentsCount,
    locked
  }: GridNoteCardProps) {
    const { colors, isDark } = useThemeColors();
    const isSearchResult = item.type === "searchResult";
    const noteItem = isSearchResult ? undefined : item;
    const searchItem = isSearchResult ? item : undefined;
    const isEditingNote = useTabStore(
      (state) =>
        state.tabs.find((t) => t.id === state.currentTab)?.session?.noteId ===
        item.id
    );
    const selectionMode = useSelectionStore((state) => state.selectionMode);
    const [selected] = useIsSelected(item);
    const bodyPreview = useNotePreview(item, locked);

    const colorHex = color?.colorCode;
    const isSelected = !isSearchResult && selectionMode === "note" && selected;
    const highlighted = isEditingNote || isSelected;

    const cardBackground = isSelected
      ? colors.selected.background
      : colorHex
        ? mixHexColor(colorHex, isDark ? "#1b1b1b" : "#ffffff", isDark ? 0.22 : 0.26)
        : colors.secondary.background;

    const cardBorder = highlighted
      ? colorHex || colors.primary.accent
      : colorHex
        ? withHexAlpha(colorHex, isDark ? 0.5 : 0.58)
        : colors.primary.border;

    const hasActiveReminder = !!(reminder && isReminderActive(reminder));
    const hasExpiry = !!noteItem?.expiryDate?.value;
    const firstTag = tags?.items?.[0];
    const matchCount = searchItem
      ? searchItem.content?.reduce((acc, g) => acc + g.length, 0) || 0
      : 0;

    const openSearchNote = async () => {
      if (!searchItem) return;
      const note = await db.notes.note(searchItem.id);
      if (!note) return;
      eSendEvent(eOnLoadNote, {
        item: {
          ...note,
          content: searchItem.rawContent
            ? {
                data: searchItem.rawContent || "",
                type: "tiptap"
              }
            : undefined
        }
      });
      fluidTabsRef.current?.goToPage("editor");
    };

    const openCardProperties = async () => {
      if (noteItem) {
        Properties.present(noteItem);
        return;
      }
      const note = await db.notes.note(item.id);
      if (note) Properties.present(note);
    };

    const onLongPress = () => {
      if (isSearchResult) {
        openCardProperties();
        return;
      }
      if (useSelectionStore.getState().selectionMode !== item.type) {
        useSelectionStore.getState().setSelectionMode(item.type);
      }
      useSelectionStore.getState().setSelectedItem(item.id);
    };

    const onPress = () => {
      if (searchItem) {
        openSearchNote();
        return;
      }
      if (!noteItem || selectItem(noteItem)) return;
      openNote(noteItem, false, false);
    };

    return (
      <Pressable
        testID={notesnook.ids.note.get(index)}
        onPress={onPress}
        onLongPress={onLongPress}
        android_ripple={{
          color: withHexAlpha(colorHex || colors.primary.accent, 0.14),
          borderless: false
        }}
        style={{
          height: NOOKLAB_GRID_CARD_HEIGHT,
          borderRadius: 12,
          backgroundColor: cardBackground,
          borderWidth: highlighted ? 2 : 1,
          borderColor: cardBorder,
          overflow: "hidden",
          justifyContent: "space-between",
          elevation: isDark ? 1 : 2,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: isDark ? 0.25 : 0.1,
          shadowRadius: 3
        }}
      >
        {colorHex ? (
          <View
            style={{
              height: 4,
              width: "100%",
              backgroundColor: colorHex
            }}
          />
        ) : null}

        <View
          style={{
            flex: 1,
            paddingHorizontal: 10,
            paddingTop: colorHex ? 7 : 10,
            paddingBottom: 8,
            justifyContent: "space-between"
          }}
        >
          <View style={{ flex: 1, overflow: "hidden" }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 4,
                marginBottom: 4
              }}
            >
              <Paragraph
                numberOfLines={1}
                color={colors.primary.heading}
                size={AppFontSize.sm}
                style={{
                  flex: 1,
                  fontWeight: "700"
                }}
              >
                {searchItem
                  ? searchItem.title?.length
                    ? renderHighlightedTokens(
                        searchItem.title,
                        colors.secondary.accent,
                        colors.secondary.accentForeground,
                        `${item.id}-t`
                      )
                    : "Untitled"
                  : noteItem?.title || "Untitled"}
              </Paragraph>

              {!isSearchResult && selectionMode === "note" ? (
                <AppIcon
                  name={selected ? "checkbox-outline" : "checkbox-blank-outline"}
                  color={selected ? colors.selected.icon : colors.secondary.icon}
                  size={AppFontSize.md}
                />
              ) : (
                <Pressable
                  hitSlop={8}
                  onPress={(e) => {
                    e.stopPropagation();
                    openCardProperties();
                  }}
                  style={{
                    width: 24,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: -4
                  }}
                >
                  <Icon
                    name="dots-vertical"
                    size={16}
                    color={colors.secondary.icon}
                  />
                </Pressable>
              )}
            </View>

            {locked ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 6
                }}
              >
                <Icon
                  name="lock"
                  size={AppFontSize.xs}
                  color={colors.secondary.icon}
                />
                <Paragraph
                  size={AppFontSize.xxs}
                  color={colors.secondary.paragraph}
                >
                  Locked note
                </Paragraph>
              </View>
            ) : searchItem?.content?.length ? (
              <View style={{ gap: 2, overflow: "hidden" }}>
                {searchItem.content.slice(0, 4).map((group, gIdx) => (
                  <Paragraph
                    key={`${item.id}-sg-${gIdx}`}
                    numberOfLines={2}
                    size={AppFontSize.xxs}
                    color={colors.primary.paragraph}
                    style={{ lineHeight: 16 }}
                  >
                    {renderHighlightedTokens(
                      group,
                      colors.secondary.accent,
                      colors.secondary.accentForeground,
                      `${item.id}-c-${gIdx}`
                    )}
                  </Paragraph>
                ))}
              </View>
            ) : bodyPreview ? (
              <Paragraph
                numberOfLines={6}
                size={AppFontSize.xxs}
                color={colors.primary.paragraph}
                style={{
                  lineHeight: 16.5
                }}
              >
                {bodyPreview}
              </Paragraph>
            ) : null}
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 4,
              paddingTop: 4
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                flexShrink: 1
              }}
            >
              {searchItem ? (
                <Paragraph
                  numberOfLines={1}
                  style={{
                    fontSize: AppFontSize.xxxs,
                    color: colorHex || colors.secondary.paragraph,
                    fontWeight: "600"
                  }}
                >
                  {matchCount > 0 ? `${matchCount} match${matchCount === 1 ? "" : "es"}` : "Match"}
                </Paragraph>
              ) : (
                <Paragraph
                  numberOfLines={1}
                  style={{
                    fontSize: AppFontSize.xxxs,
                    color: colors.secondary.paragraph
                  }}
                >
                  {getFormattedDate(
                    date,
                    dayjs(date).isBefore(dayjs().subtract(1, "day").hour(23))
                      ? "date"
                      : "time"
                  )}
                </Paragraph>
              )}

              {firstTag ? (
                <Paragraph
                  numberOfLines={1}
                  style={{
                    fontSize: AppFontSize.xxxs,
                    color: colorHex || colors.secondary.paragraph,
                    maxWidth: 72
                  }}
                >
                  #{firstTag.title}
                </Paragraph>
              ) : null}
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4
              }}
            >
              {noteItem?.conflicted ? (
                <Icon
                  name="alert-circle"
                  size={12}
                  color={colors.error.accent}
                />
              ) : null}
              {noteItem?.pinned ? (
                <Icon
                  name="pin-outline"
                  size={12}
                  color={colorHex || colors.primary.accent}
                />
              ) : null}
              {noteItem?.favorite ? (
                <Icon name="star" size={12} color={colors.static.orange} />
              ) : null}
              {hasActiveReminder ? (
                <Icon
                  name="bell-outline"
                  size={12}
                  color={colorHex || colors.primary.accent}
                />
              ) : null}
              {hasExpiry ? (
                <Icon
                  name="clock-outline"
                  size={12}
                  color={colors.error.accent}
                />
              ) : null}
              {attachmentsCount > 0 ? (
                <Icon
                  name="paperclip"
                  size={12}
                  color={colors.secondary.icon}
                />
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.date === next.date &&
    prev.item?.id === next.item?.id &&
    prev.item?.type === next.item?.type &&
    (prev.item?.type === "note" ? prev.item.dateModified : undefined) ===
      (next.item?.type === "note" ? next.item.dateModified : undefined) &&
    (prev.item?.type === "note"
      ? prev.item.title
      : prev.item?.title?.map((m) => m.match).join()) ===
      (next.item?.type === "note"
        ? next.item.title
        : next.item?.title?.map((m) => m.match).join()) &&
    (prev.item?.type === "note" ? prev.item.pinned : undefined) ===
      (next.item?.type === "note" ? next.item.pinned : undefined) &&
    (prev.item?.type === "note" ? prev.item.favorite : undefined) ===
      (next.item?.type === "note" ? next.item.favorite : undefined) &&
    (prev.item?.type === "note" ? prev.item.conflicted : undefined) ===
      (next.item?.type === "note" ? next.item.conflicted : undefined) &&
    prev.color?.colorCode === next.color?.colorCode &&
    prev.reminder?.id === next.reminder?.id &&
    prev.attachmentsCount === next.attachmentsCount &&
    prev.tags?.items?.[0]?.id === next.tags?.items?.[0]?.id &&
    prev.locked === next.locked
);
