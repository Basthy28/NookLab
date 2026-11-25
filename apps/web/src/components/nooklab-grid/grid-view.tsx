/*
 * NookLab — virtualized grid view (VirtuosoGrid).
 *
 * Kept in a dedicated file to isolate grid code from upstream and avoid
 * rebase conflicts.
 */
import { useResolvedItem } from "@notesnook/common";
import { GroupingKey, Item, VirtualizedGrouping } from "@notesnook/core";
import { Flex } from "@theme-ui/components";
import { forwardRef, useRef } from "react";
import {
  Components,
  ContextProp,
  GridComponents,
  GridItemProps,
  GridListProps,
  VirtuosoGrid,
  VirtuosoGridHandle
} from "react-virtuoso";
import { store as selectionStore } from "../../stores/selection-store";
import Announcements from "../announcements";
import GroupHeader from "../group-header";
import { GRID_ITEM_HEIGHT } from "../list-container/list-profiles";
import { Context } from "../list-container/types";

type GridHeaderContext = {
  header?: JSX.Element;
  onMouseUp?: (e: MouseEvent, itemIndex: number) => void;
};

// NookLab: forwardRef is required so VirtuosoGrid can measure the first item;
// without a ref, itemWidth stays 0 and the grid falls back to rendering 1 item.
const GridList = forwardRef<HTMLDivElement, GridListProps>(function GridList(
  { style, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      {...props}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
        gap: 10,
        paddingLeft: 10,
        paddingRight: 10,
        alignContent: "start",
        // Preserve virtual scroll paddingTop/paddingBottom (offsetTop/offsetBottom).
        ...style
      }}
    >
      {children}
    </div>
  );
});

function GridItem({
  style,
  children,
  context,
  ...props
}: GridItemProps & ContextProp<GridHeaderContext>) {
  return (
    <div
      {...props}
      onMouseUp={(e) => context?.onMouseUp?.(e.nativeEvent, props["data-index"])}
      style={{
        ...style,
        height: GRID_ITEM_HEIGHT,
        minWidth: 0
      }}
    >
      {children}
    </div>
  );
}

function GridHeader({ context }: { context?: GridHeaderContext }) {
  return (
    <div style={{ paddingBottom: 10 }}>
      {context?.header ? context.header : <Announcements />}
    </div>
  );
}

function GridFooter() {
  return <div style={{ height: 10 }} />;
}

type GridTopBarProps = {
  group?: GroupingKey;
  items: VirtualizedGrouping<Item>;
  isSearching?: boolean;
  refresh: () => void;
  context?: Context;
  focusedGroupIndex: number;
  focusGroup: (index: number) => void;
  selectItems: (items: string[]) => void;
  onJump: (index: number) => void;
};

function GridTopBar({
  group,
  items,
  isSearching,
  refresh,
  context,
  focusedGroupIndex,
  focusGroup,
  selectItems,
  onJump
}: GridTopBarProps) {
  const firstItem = useResolvedItem({ index: 0, items });
  if (!group) return null;

  const title = firstItem?.group?.title || (isSearching ? "search" : group);

  return (
    <GroupHeader
      groupingKey={group}
      isSearching={isSearching}
      refresh={refresh}
      title={title}
      isFocused={focusedGroupIndex === 0}
      index={0}
      context={context}
      onSelectGroup={async () => {
        if (!items.groups) return;

        const groups = await items.groups();
        const nextGroupIndex = groups[1]?.index || items.length;
        const ids = await items.ids();

        selectItems([
          ...selectionStore.get().selectedItems,
          ...ids.slice(0, nextGroupIndex)
        ]);
      }}
      groups={async () => (items.groups ? items.groups() : [])}
      onJump={(index) => {
        onJump(index);
        focusGroup(index);
      }}
    />
  );
}

type NookLabGridProps = {
  type: GroupingKey;
  group?: GroupingKey;
  items: VirtualizedGrouping<Item>;
  context?: Context;
  refresh: () => void;
  header?: JSX.Element;
  isSearching?: boolean;
  Scroller: Components["Scroller"];
  focusedGroupIndex: number;
  focusGroup: (index: number) => void;
  selectItems: (items: string[]) => void;
  onMouseUp?: (e: MouseEvent, itemIndex: number) => void;
  renderItem: (index: number) => JSX.Element;
};

export function NookLabGrid({
  type,
  group,
  items,
  context,
  refresh,
  header,
  isSearching,
  Scroller,
  focusedGroupIndex,
  focusGroup,
  selectItems,
  onMouseUp,
  renderItem
}: NookLabGridProps) {
  const gridRef = useRef<VirtuosoGridHandle>(null);

  return (
    <Flex variant="columnFill" sx={{ minHeight: 0 }}>
      <GridTopBar
        group={group}
        items={items}
        isSearching={isSearching}
        refresh={refresh}
        context={context}
        focusedGroupIndex={focusedGroupIndex}
        focusGroup={focusGroup}
        selectItems={selectItems}
        onJump={(index) =>
          gridRef.current?.scrollToIndex({ index, behavior: "auto" })
        }
      />
      <Flex variant="columnFill" sx={{ minHeight: 0 }}>
        <VirtuosoGrid<unknown, GridHeaderContext>
          ref={gridRef}
          data-test-id={`${type}-grid`}
          style={{ height: "100%" }}
          computeItemKey={(index) => items.key(index)}
          totalCount={items.length}
          increaseViewportBy={{ top: 200, bottom: 200 }}
          context={{ header, onMouseUp }}
          components={{
            Scroller: Scroller as GridComponents<GridHeaderContext>["Scroller"],
            Header: GridHeader,
            Footer: GridFooter,
            List: GridList,
            Item: GridItem
          }}
          itemContent={(index) => renderItem(index)}
        />
      </Flex>
    </Flex>
  );
}
