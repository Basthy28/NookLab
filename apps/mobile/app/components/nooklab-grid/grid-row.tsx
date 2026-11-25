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
  item: Note;
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
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const applyResolved = useCallback((entry: any) => {
    if (!entry?.item || entry.item.type !== "note") return;
    const data = isNoteResolvedData(entry.data) ? entry.data : undefined;
    setResolved({
      item: entry.item as Note,
      color: data?.color,
      tags: data?.tags,
      reminder: data?.reminder,
      attachmentsCount: data?.attachments?.total || 0,
      locked: !!data?.locked,
      notebooks: data?.notebooks
    });
  }, []);

  if (currentIndex.current !== index) {
    currentIndex.current = index;
    const cached = items?.cacheItem(index);
    if (cached?.item) {
      const data = isNoteResolvedData(cached.data) ? cached.data : undefined;
      const next: ResolvedNoteState = {
        item: cached.item as Note,
        color: data?.color,
        tags: data?.tags,
        reminder: data?.reminder,
        attachmentsCount: data?.attachments?.total || 0,
        locked: !!data?.locked,
        notebooks: data?.notebooks
      };
      if (resolved?.item?.id !== next.item.id) {
        setResolved(next);
      }
    } else if (resolved !== null) {
      setResolved(null);
    }
  }

  useEffect(() => {
    clearTimeout(timer.current);
    const idx = index;
    timer.current = setTimeout(
      async () => {
        try {
          if (idx !== currentIndex.current) return;
          const entry = await items?.item(idx, resolveItems);
          if (idx !== currentIndex.current) return;
          applyResolved(entry);
        } catch {
          /* ignore */
        }
      },
      items?.cacheItem(index) ? 80 : 0
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
        index={index}
        date={getSortValue(groupOptions, resolved.item) || 0}
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
