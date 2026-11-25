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

import {
  GroupingByIdKey,
  GroupingKey,
  Item,
  VirtualizedGrouping
} from "@notesnook/core";
import { useThemeColors } from "@notesnook/theme";
import { LegendList, LegendListRenderItemProps } from "@legendapp/list";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
  View
} from "react-native";
import { notesnook } from "../../../e2e/test.ids";
import { useGroupOptions } from "../../hooks/use-group-options";
import { eSendEvent } from "../../services/event-manager";
import Sync from "../../services/sync";
import { RouteName } from "../../stores/use-navigation-store";
import { useSettingStore } from "../../stores/use-setting-store";
import { eScrollEvent } from "../../utils/events";
import { fluidTabsRef } from "../../utils/global-refs";
import { Header } from "../list-items/headers/header";
import {
  buildMobileGridRows,
  MobileGridGroupInput,
  MobileGridRow,
  NOOKLAB_GRID_CARD_HEIGHT,
  NOOKLAB_GRID_ROW_GAP
} from "../nooklab-grid/grid-helpers";
import { GridRow } from "../nooklab-grid/grid-row";
import { Empty, PlaceholderData } from "./empty";
import { ListItemWrapper } from "./list-item.wrapper";
import { ScrollView } from "react-native-actions-sheet";

type ListProps = {
  data: VirtualizedGrouping<Item> | undefined;
  dataType: Item["type"];
  mode?: "drawer" | "sheet";
  onRefresh?: () => void;
  loading?: boolean;
  headerTitle?: string;
  customAccentColor?: string;
  renderedInRoute?: RouteName;
  CustomLisHeader?: React.JSX.Element;
  isRenderedInActionSheet?: boolean;
  CustomListComponent?: React.JSX.ElementType;
  placeholder?: PlaceholderData;
  groupType: GroupingKey;
  id?: string;
  type?: GroupingByIdKey;
};

const onMomentumScrollEnd = () => {
  fluidTabsRef.current?.unlock();
};

export default function List(props: ListProps) {
  const { colors } = useThemeColors();
  const scrollRef = useRef(null);
  const [notesListMode, notebooksListMode] = useSettingStore((state) => [
    state.settings.notesListMode,
    state.settings.notebooksListMode
  ]);

  const isGridModeEnabled =
    props.dataType === "note" &&
    (notesListMode === "grid" || !notesListMode) &&
    !props.isRenderedInActionSheet;

  const isCompactModeEnabled =
    (props.dataType === "note" && notesListMode === "compact") ||
    (props.dataType === "notebook" && notebooksListMode === "compact");

  const groupOptions = useGroupOptions(props.groupType, props.id, props.type);
  const [gridGroups, setGridGroups] = useState<MobileGridGroupInput[] | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    if (!isGridModeEnabled || !props.data?.groups || props.data.length === 0) {
      setGridGroups(null);
      return;
    }

    props.data
      .groups()
      .then((groups) => {
        if (!cancelled) setGridGroups(groups as MobileGridGroupInput[]);
      })
      .catch(() => {
        if (!cancelled) setGridGroups([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isGridModeEnabled, props.data]);

  const gridRows = useMemo(() => {
    if (!isGridModeEnabled) return [];
    return buildMobileGridRows(props.data?.length || 0, gridGroups);
  }, [isGridModeEnabled, props.data, gridGroups]);

  const gridScrollRef = useMemo(
    () => ({
      get current() {
        const list = scrollRef.current as any;
        if (!list) return null;
        return {
          ...list,
          scrollToIndex: (opts: { index: number; animated?: boolean }) => {
            const rowIndex = gridRows.findIndex(
              (r) => r.kind === "section-header" && r.itemIndex === opts.index
            );
            list.scrollToIndex?.({
              ...opts,
              index: rowIndex >= 0 ? rowIndex : 0
            });
          }
        };
      }
    }),
    [gridRows]
  );

  const _onRefresh = async () => {
    Sync.run("global", false, "full", () => {
      props.onRefresh?.();
    });
  };

  const getItemType = React.useCallback(
    (item: MobileGridRow | boolean, index: number) => {
      if (isGridModeEnabled && typeof item === "object" && item !== null) {
        return item.kind;
      }
      return props.data?.type(index);
    },
    [isGridModeEnabled, props.data]
  );

  const renderItem = React.useCallback(
    (itemProps: LegendListRenderItemProps<any, any>) => {
      if (
        isGridModeEnabled &&
        itemProps.item &&
        typeof itemProps.item === "object" &&
        "kind" in itemProps.item
      ) {
        return (
          <GridRow
            row={itemProps.item as MobileGridRow}
            items={props.data}
            group={props.groupType as GroupingKey}
            groupId={props.id}
            type={props.type}
            groupOptions={groupOptions}
            renderedInRoute={props.renderedInRoute}
            customAccentColor={props.customAccentColor}
            scrollRef={gridScrollRef}
          />
        );
      }

      return (
        <ListItemWrapper
          index={itemProps.index}
          isSheet={props.isRenderedInActionSheet || false}
          items={props.data}
          groupId={props.id}
          groupOptions={groupOptions}
          group={props.groupType as GroupingKey}
          renderedInRoute={props.renderedInRoute}
          customAccentColor={props.customAccentColor}
          dataType={props.dataType}
          type={props.type}
          scrollRef={scrollRef}
        />
      );
    },
    [
      isGridModeEnabled,
      props.isRenderedInActionSheet,
      props.data,
      props.id,
      props.groupType,
      props.renderedInRoute,
      props.customAccentColor,
      props.dataType,
      groupOptions,
      props.type
    ]
  );

  const onListScroll = React.useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!event) return;
      eSendEvent(eScrollEvent, {
        y: event.nativeEvent.contentOffset.y,
        route: props.renderedInRoute,
        id: props.id || props.renderedInRoute
      });
    },
    [props.renderedInRoute, props.id]
  );

  useEffect(() => {
    eSendEvent(eScrollEvent, {
      y: 0,
      route: props.renderedInRoute,
      id: props.id || props.renderedInRoute
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <View
        style={{
          flex: 1
        }}
      >
        <LegendList
          key={isGridModeEnabled ? "nooklab-grid" : "nooklab-list"}
          ref={scrollRef}
          contentContainerStyle={{
            flexGrow: 1
          }}
          extraData={isGridModeEnabled ? gridRows : props.data}
          testID={notesnook.list.id}
          data={isGridModeEnabled ? gridRows : props.data?.placeholders || []}
          keyExtractor={(item: MobileGridRow | boolean, index: number) =>
            isGridModeEnabled && typeof item === "object" && item !== null
              ? item.key
              : `item-${index}`
          }
          renderScrollComponent={
            props.isRenderedInActionSheet
              ? (props) => <ScrollView {...props} />
              : undefined
          }
          renderItem={renderItem}
          onScroll={onListScroll}
          nestedScrollEnabled={true}
          onMomentumScrollEnd={onMomentumScrollEnd}
          getItemType={getItemType}
          estimatedItemSize={
            isGridModeEnabled
              ? NOOKLAB_GRID_CARD_HEIGHT + NOOKLAB_GRID_ROW_GAP
              : isCompactModeEnabled
                ? 60
                : 120
          }
          directionalLockEnabled={true}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="interactive"
          ListEmptyComponent={
            <View
              style={{
                flex: 1
              }}
            >
              <Empty
                loading={props.loading}
                title={props.headerTitle}
                dataType={props.dataType}
                color={props.customAccentColor}
                placeholder={props.placeholder}
                screen={props.renderedInRoute}
              />
            </View>
          }
          ListFooterComponent={
            <View
              style={{ height: props.data?.placeholders?.length ? 100 : 0 }}
            />
          }
          refreshControl={
            props.isRenderedInActionSheet ? (
              <></>
            ) : (
              <RefreshControl
                tintColor={colors.primary.accent}
                colors={[colors.primary.accent]}
                progressBackgroundColor={colors.secondary.background}
                onRefresh={_onRefresh}
                refreshing={false}
              />
            )
          }
          ListHeaderComponent={
            <>
              {props.CustomLisHeader ? (
                props.CustomLisHeader
              ) : !props.headerTitle ? null : (
                <Header
                  color={props.customAccentColor}
                  screen={props.renderedInRoute}
                />
              )}
            </>
          }
        />
      </View>
    </>
  );
}
