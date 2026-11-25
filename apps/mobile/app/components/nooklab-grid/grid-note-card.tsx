/*
 * NookLab — ColorNote-style note card for 2-column mobile Grid View.
 */
import { getFormattedDate, TagsWithDateEdited } from "@notesnook/common";
import type { Color, Note, Reminder } from "@notesnook/core";
import { isReminderActive } from "@notesnook/core";
import { useThemeColors } from "@notesnook/theme";
import dayjs from "dayjs";
import React from "react";
import { Pressable, View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { notesnook } from "../../../e2e/test.ids";
import useIsSelected from "../../hooks/use-selected";
import { useTabStore } from "../../screens/editor/tiptap/use-tab-store";
import { useSelectionStore } from "../../stores/use-selection-store";
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
  item: Note;
  index: number;
  date: number;
  color?: Color;
  tags?: TagsWithDateEdited;
  reminder?: Reminder;
  attachmentsCount: number;
  locked?: boolean;
};

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
    const isEditingNote = useTabStore(
      (state) =>
        state.tabs.find((t) => t.id === state.currentTab)?.session?.noteId ===
        item.id
    );
    const selectionMode = useSelectionStore((state) => state.selectionMode);
    const [selected] = useIsSelected(item);
    const bodyPreview = useNotePreview(item, locked);

    const colorHex = color?.colorCode;
    const isSelected = selectionMode === "note" && selected;
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
    const hasExpiry = !!item.expiryDate?.value;
    const firstTag = tags?.items?.[0];

    const onLongPress = () => {
      if (useSelectionStore.getState().selectionMode !== item.type) {
        useSelectionStore.getState().setSelectionMode(item.type);
      }
      useSelectionStore.getState().setSelectedItem(item.id);
    };

    const onPress = () => {
      if (selectItem(item)) return;
      openNote(item, false, false);
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
                {item.title || "Untitled"}
              </Paragraph>

              {selectionMode === "note" ? (
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
                    Properties.present(item);
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
              {item.conflicted ? (
                <Icon
                  name="alert-circle"
                  size={12}
                  color={colors.error.accent}
                />
              ) : null}
              {item.pinned ? (
                <Icon
                  name="pin-outline"
                  size={12}
                  color={colorHex || colors.primary.accent}
                />
              ) : null}
              {item.favorite ? (
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
    prev.item?.dateModified === next.item?.dateModified &&
    prev.item?.title === next.item?.title &&
    prev.item?.pinned === next.item?.pinned &&
    prev.item?.favorite === next.item?.favorite &&
    prev.item?.conflicted === next.item?.conflicted &&
    prev.color?.colorCode === next.color?.colorCode &&
    prev.reminder?.id === next.reminder?.id &&
    prev.attachmentsCount === next.attachmentsCount &&
    prev.tags?.items?.[0]?.id === next.tags?.items?.[0]?.id &&
    prev.locked === next.locked
);
