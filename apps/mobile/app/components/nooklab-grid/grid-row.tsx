/*
 * NookLab — 2-column virtualized row & section-header adapter for LegendList.
 */
import {
  isNoteResolvedData,
  NotebooksWithDateEdited,
  resolveItems,
  TagsWithDateEdited
} from "@notesnook/common";
import {
  Color,
  GroupingByIdKey,
  GroupingKey,
  GroupOptions,
  HighlightedResult,
  Item,
  Note,
  Reminder,
  VirtualizedGrouping,
  getSortValue
} from "@notesnook/core";
import { useThemeColors } from "@notesnook/theme";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { eSendEvent } from "../../services/event-manager";
import { RouteName } from "../../stores/use-navigation-store";
import { eOpenJumpToDialog } from "../../utils/events";
import { SectionHeader } from "../list-items/headers/section-header";
import {
  MobileGridRow,
  NOOKLAB_GRID_CARD_HEIGHT,
  NOOKLAB_GRID_ROW_GAP
} from "./grid-helpers";
import { GridNoteCard } from "./grid-note-card";

type ResolvedNoteState = {
  item: Note | HighlightedResult;
  fullNote?: Note;
  color?: Color;
  tags?: TagsWithDateEdited;
  reminder?: Reminder;
  attachmentsCount: number;
  locked: boolean;
  notebooks?: NotebooksWithDateEdited;
};

function GridNoteCell({
  index,
  items,
  groupOptions
}: {
  index: number;
  items: VirtualizedGrouping<Item> | undefined;
  groupOptions: GroupOptions;
}) {
  const { colors } = useThemeColors();
  const [resolved, setResolved] = useState<ResolvedNoteState | null>(null);
  const currentIndex = useRef<number>(-1);
  const currentItems = useRef<VirtualizedGrouping<Item> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyResolved = useCallback((entry: any) => {
    const item = entry?.item;
    if (!item || (item.type !== "note" && item.type !== "searchResult")) return;
    const data = isNoteResolvedData(entry.data) ? entry.data : undefined;
    setResolved({
      item: item as Note | HighlightedResult,
      fullNote: data?.note,
      color: data?.color,
      tags: data?.tags,
      reminder: data?.reminder,
      attachmentsCount: data?.attachments?.total || 0,
      locked: !!data?.locked,
      notebooks: data?.notebooks
    });
  }, []);

  if (currentIndex.current !== index || currentItems.current !== items) {
    currentIndex.current = index;
    currentItems.current = items;
    const cached = items?.cacheItem(index);
    if (
      cached?.item &&
      (cached.item.type === "note" || cached.item.type === "searchResult")
    ) {
      const data = isNoteResolvedData(cached.data) ? cached.data : undefined;
      const next: ResolvedNoteState = {
        item: cached.item as Note | HighlightedResult,
        fullNote: data?.note,
        color: data?.color,
        tags: data?.tags,
        reminder: data?.reminder,
        attachmentsCount: data?.attachments?.total || 0,
        locked: !!data?.locked,
        notebooks: data?.notebooks
      };
      if (
        resolved?.item?.id !== next.item.id ||
        resolved?.color?.colorCode !== next.color?.colorCode ||
        resolved?.fullNote?.dateModified !== next.fullNote?.dateModified
      ) {
        setResolved(next);
      }
    } else if (resolved !== null) {
      setResolved(null);
    }
  }

  useEffect(() => {
    clearTimeout(timer.current);
    const idx = index;
    const activeItems = items;
    timer.current = setTimeout(
      async () => {
        try {
          if (idx !== currentIndex.current || activeItems !== currentItems.current)
            return;
          const entry = await activeItems?.item(idx, resolveItems);
          if (idx !== currentIndex.current || activeItems !== currentItems.current)
            return;
          applyResolved(entry);
        } catch {
          /* ignore */
        }
      },
      items?.cacheItem(index)?.data ? 40 : 0
    );
    return () => clearTimeout(timer.current);
  }, [index, items, applyResolved]);

  if (!resolved) {
    return (
      <View
        style={{
          flex: 1,
          height: NOOKLAB_GRID_CARD_HEIGHT,
          borderRadius: 12,
          backgroundColor: colors.secondary.background,
          borderWidth: 1,
          borderColor: colors.primary.border
        }}
      />
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <GridNoteCard
        item={resolved.item}
        fullNote={resolved.fullNote}
        index={index}
        date={
          resolved.item.type === "note"
            ? getSortValue(groupOptions, resolved.item) || 0
            : resolved.fullNote
              ? getSortValue(groupOptions, resolved.fullNote) || 0
              : Date.now()
        }
        color={resolved.color}
        tags={resolved.tags}
        reminder={resolved.reminder}
        attachmentsCount={resolved.attachmentsCount}
        locked={resolved.locked}
      />
    </View>
  );
}

export type GridRowProps = {
  row: MobileGridRow;
  items: VirtualizedGrouping<Item> | undefined;
  group: GroupingKey;
  groupId?: string;
  type?: GroupingByIdKey;
  groupOptions: GroupOptions;
  renderedInRoute?: RouteName;
  customAccentColor?: string;
  scrollRef: any;
};

export function GridRow(props: GridRowProps) {
  const { row } = props;

  if (row.kind === "section-header") {
    return (
      <SectionHeader
        screen={props.renderedInRoute}
        item={row.group}
        index={row.showControls ? 0 : row.itemIndex}
        dataType="note"
        group={props.group}
        groupId={props.groupId}
        type={props.type}
        color={props.customAccentColor}
        groupOptions={props.groupOptions}
        onOpenJumpToDialog={() => {
          eSendEvent(eOpenJumpToDialog, {
            ref: props.scrollRef,
            data: props.items
          });
        }}
      />
    );
  }

  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: NOOKLAB_GRID_ROW_GAP,
        gap: NOOKLAB_GRID_ROW_GAP,
        marginBottom: NOOKLAB_GRID_ROW_GAP
      }}
    >
      <GridNoteCell
        index={row.indices[0]}
        items={props.items}
        groupOptions={props.groupOptions}
      />
      {row.indices.length > 1 ? (
        <GridNoteCell
          index={row.indices[1]!}
          items={props.items}
          groupOptions={props.groupOptions}
        />
      ) : (
        <View style={{ flex: 1 }} />
      )}
    </View>
  );
}
