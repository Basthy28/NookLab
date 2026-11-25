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

import { Color, HighlightedResult, Match as TMatch } from "@notesnook/core";
import { Button, Flex, Text } from "@theme-ui/components";
import React, { Fragment, useState } from "react";
import { useEditorStore } from "../../stores/editor-store";
import { useStore as useNoteStore } from "../../stores/note-store";
import { useStore as useThemeStore } from "../../stores/theme-store";
import ListItem from "../list-item";
import { ChevronDown, ChevronRight } from "../icons";
import { db } from "../../common/db";
import { useMenuTrigger } from "../../hooks/use-menu";
import { noteMenuItems } from "../note";
import { MenuItem } from "@notesnook/ui";

type SearchResultProps = {
  item: HighlightedResult;
  color?: Color;
  grid?: boolean;
};

function SearchResult(props: SearchResultProps) {
  const { item, color, grid } = props;

  const isOpened = useEditorStore((store) => store.isNoteOpen(item.id));
  const isExpandable = item.content.length > 0;
  const [isExpanded, setIsExpanded] = useState(isExpandable);
  const isCompact = useNoteStore((store) => store.viewMode === "compact");
  const colorScheme = useThemeStore((store) => store.colorScheme);
  const { openMenu } = useMenuTrigger();

  if (!item.title.length && !item.content.length) return null;

  const isDark = colorScheme === "dark";
  const colorHex = color?.colorCode;
  const matchTotal =
    item.content?.reduce((count, next) => next.length + count, 0) || 0;
  const coloredBg = colorHex
    ? `color-mix(in srgb, ${colorHex} ${isDark ? 22 : 26}%, ${
        isDark ? "#1b1b1b" : "white"
      })`
    : undefined;
  const coloredBorder = colorHex
    ? `color-mix(in srgb, ${colorHex} ${isDark ? 45 : 55}%, transparent)`
    : undefined;

  if (grid) {
    return (
      <Flex
        id={`id_${item.id}`}
        data-test-id="grid-search-card"
        onClick={() => {
          useEditorStore.getState().openSession(item.id, {
            rawContent: item.rawContent,
            force: true
          });
        }}
        onContextMenu={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const items = await menuItems(item);
          if (items.length) openMenu(items);
        }}
        sx={{
          height: "100%",
          boxSizing: "border-box",
          flexDirection: "column",
          justifyContent: "space-between",
          borderRadius: 4,
          p: "10px 12px",
          bg: isOpened
            ? "background-selected"
            : coloredBg || "background-secondary",
          border: isOpened ? "2px solid" : "1px solid",
          borderColor: isOpened
            ? colorHex || "accent"
            : coloredBorder || "border",
          borderTop: colorHex ? `4px solid ${colorHex}` : undefined,
          cursor: "pointer",
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
          ":hover": { filter: isDark ? "brightness(1.08)" : "brightness(0.97)" }
        }}
      >
        <Flex sx={{ flexDirection: "column", flex: 1, minHeight: 0, gap: "6px" }}>
          <Flex sx={{ alignItems: "center", justifyContent: "space-between", gap: 1 }}>
            <Text
              data-test-id="title"
              variant="body"
              color={isOpened ? "paragraph-selected" : "heading"}
              sx={{
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontWeight: "bold",
                ".match": {
                  bg: "accent-secondary",
                  color: "accentForeground-secondary"
                }
              }}
            >
              {item.title.map((match, i) => (
                <Match key={match.id || i} match={match} />
              ))}
            </Text>
            {matchTotal > 0 ? (
              <Text
                variant="subBody"
                sx={{
                  flexShrink: 0,
                  color: colorHex || "paragraph"
                }}
              >
                {matchTotal}
              </Text>
            ) : null}
          </Flex>

          <Flex
            sx={{
              flexDirection: "column",
              gap: "4px",
              overflow: "hidden",
              flex: 1
            }}
          >
            {item.content.slice(0, 4).map((group, index) => (
              <Text
                key={`${item.id}_g_${index}`}
                variant="body"
                color={isOpened ? "paragraph-selected" : "paragraph"}
                onClick={(e) => {
                  e.stopPropagation();
                  useEditorStore.getState().openSession(item.id, {
                    rawContent: item.rawContent,
                    force: true,
                    activeSearchResultId: group[0]?.id
                  });
                }}
                sx={{
                  fontSize: "12px",
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  ".match": {
                    bg: "accent-secondary",
                    color: "accentForeground-secondary"
                  }
                }}
              >
                {group.map((match, i) => (
                  <Match key={match.id || i} match={match} />
                ))}
              </Text>
            ))}
          </Flex>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex
      sx={{
        flexDirection: "column",
        mx: 1,
        my: colorHex ? "3px" : undefined,
        borderRadius: colorHex ? "default" : undefined,
        bg: coloredBg,
        border: coloredBorder ? `1px solid ${coloredBorder}` : undefined,
        borderLeft: colorHex ? `4px solid ${colorHex}` : undefined,
        overflow: colorHex ? "hidden" : undefined
      }}
    >
      <ListItem
        isFocused={isOpened}
        item={item}
        menuItems={menuItems}
        onClick={() => {
          useEditorStore.getState().openSession(item.id, {
            rawContent: item.rawContent,
            force: true
          });
        }}
        onMiddleClick={() => {
          useEditorStore.getState().openSession(item.id, {
            openInNewTab: true,
            rawContent: item.rawContent
          });
        }}
        title={
          <Flex sx={{ alignItems: "center", gap: "small" }}>
            {isExpandable && !isCompact ? (
              <Button
                variant="secondary"
                sx={{
                  bg: "transparent",
                  p: 0,
                  borderRadius: 100,
                  flexShrink: 0
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded((s) => !s);
                }}
              >
                {isExpanded ? (
                  <ChevronDown
                    size={14}
                    color={isOpened ? "icon-selected" : "icon"}
                  />
                ) : (
                  <ChevronRight
                    size={14}
                    color={isOpened ? "icon-selected" : "icon"}
                  />
                )}
              </Button>
            ) : null}
            <Flex
              sx={{
                alignItems: "center",
                justifyContent: "space-between",
                flex: 1
              }}
            >
              <Text
                data-test-id={`title`}
                variant={"body"}
                color={isOpened ? "paragraph-selected" : "paragraph"}
                sx={{
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  fontWeight: isCompact ? "bold" : "bolder",
                  display: "block",
                  ".match": {
                    bg: "accent-secondary",
                    color: "accentForeground-secondary"
                  }
                }}
              >
                {item.title.map((match, i) => (
                  <Match key={match.id || i} match={match} />
                ))}
              </Text>

              <Text variant="subBody">{matchTotal}</Text>
            </Flex>
          </Flex>
        }
        sx={{
          my: "small",
          borderRadius: "default",
          mx: colorHex ? 0 : 1,
          bg: "transparent"
        }}
      />
      {isExpanded && !isCompact
        ? item.content.map((match, index) => (
            <ListItem
              key={`${item.id}${index}`}
              isFocused={false}
              item={item}
              menuItems={menuItems}
              onClick={() => {
                useEditorStore.getState().openSession(item.id, {
                  rawContent: item.rawContent,
                  force: true,
                  activeSearchResultId: match[0].id
                });
              }}
              onMiddleClick={() => {
                useEditorStore.getState().openSession(item.id, {
                  openInNewTab: true,
                  rawContent: item.rawContent,
                  activeSearchResultId: match[0].id
                });
              }}
              title={
                <Text
                  data-test-id={`title`}
                  variant={"body"}
                  color={isOpened ? "paragraph-selected" : "paragraph"}
                  sx={{
                    whiteSpace: "pre-wrap",
                    display: "block",
                    ".match": {
                      bg: "accent-secondary",
                      color: "accentForeground-secondary"
                    }
                  }}
                >
                  {match.map((m, i) => (
                    <Match key={m.id || i} match={m} />
                  ))}
                </Text>
              }
              sx={{
                px: 1,
                borderBottom: "1px solid var(--border)",
                mx: colorHex ? 0 : 1,
                bg: "transparent"
              }}
            />
          ))
        : null}
    </Flex>
  );
}

export default React.memo(SearchResult);

function Match({ match }: { match: TMatch }) {
  return (
    <Fragment key={match.id}>
      <span>{match.prefix}</span>
      <span className="match">{match.match}</span>
      {match.suffix ? <span>{match.suffix}</span> : null}
    </Fragment>
  );
}

async function menuItems(
  item: HighlightedResult,
  ids?: string[]
): Promise<MenuItem[]> {
  const note = await db.notes.note(item.id);
  if (!note) return [];

  const colors = await db.relations
    .to({ type: "note", id: item.id }, "color")
    .resolve();
  return noteMenuItems(note, ids, {
    locked: !!(
      await db
        .sql()
        .selectFrom("content")
        .where("noteId", "in", [note.id])
        .select(["noteId", "locked"])
        .executeTakeFirst()
    )?.locked,
    color: colors[0]
  });
}
