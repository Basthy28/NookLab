/*
 * NookLab — ColorNote-style colored card for the grid view.
 *
 * Reuses Notesnook's resolved metadata and context menu (attachments, favorite,
 * pin, lock, reminder, tags, notebooks, date) with colored card styling and a
 * multi-line body preview.
 */
import {
  formatDate,
  getFormattedReminderTime,
  NoteResolvedData
} from "@notesnook/common";
import {
  isReminderActive,
  isReminderToday,
  Note as NoteType
} from "@notesnook/core";
import { strings } from "@notesnook/intl";
import { SchemeColors } from "@notesnook/theme";
import { Flex, Text } from "@theme-ui/components";
import { useRef, type MouseEvent, type ReactNode } from "react";
import { Multiselect } from "../../common/multi-select";
import { useMenuTrigger } from "../../hooks/use-menu";
import { navigate } from "../../navigation";
import { store as appStore } from "../../stores/app-store";
import { useEditorStore } from "../../stores/editor-store";
import {
  store as selectionStore,
  useStore as useSelectionStore
} from "../../stores/selection-store";
import { useStore as useSettingStore } from "../../stores/setting-store";
import { useStore as useThemeStore } from "../../stores/theme-store";
import { showToast } from "../../utils/toast";
import IconTag from "../icon-tag";
import {
  Alert,
  Attachment,
  AttachmentError,
  Destruct,
  Lock,
  Notebook,
  Pin,
  Readonly,
  Reminder,
  Star,
  SyncOff,
  Tag as TagIcon
} from "../icons";
import { Context } from "../list-container/types";
import { noteMenuItems } from "../note";
import { useNoteBodyPreview } from "./note-preview";

type GridNoteCardProps = NoteResolvedData & {
  item: NoteType;
  date: number;
  context?: Context;
  titleOverride?: ReactNode;
  badgeText?: string;
  rawContent?: string;
};

export function GridNoteCard({
  item,
  date,
  color,
  tags,
  notebooks,
  attachments,
  locked,
  reminder,
  context,
  titleOverride,
  badgeText,
  rawContent
}: GridNoteCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dateFormat = useSettingStore((store) => store.dateFormat);
  const colorScheme = useThemeStore((store) => store.colorScheme);
  const isOpened = useEditorStore((store) => store.isNoteOpen(item.id));
  const { openMenu, target } = useMenuTrigger();
  const isMenuTarget = target && target === cardRef.current;
  const isSelected = useSelectionStore((store) => {
    const isInSelection = store.selectedItems.includes(item.id);
    return isOpened
      ? store.selectedItems.length > 1 && isInSelection
      : isInSelection;
  });
  const bodyPreview = useNoteBodyPreview(item, locked);

  const isDark = colorScheme === "dark";
  const primary: SchemeColors = color ? color.colorCode : "accent-selected";
  const highlighted = isOpened || isSelected || isMenuTarget;

  // colorCode comes from Notesnook in hex (e.g. #FFD600). Mix with white in
  // light mode (post-it feel) and dark base in dark mode to reduce glare.
  const background = isSelected
    ? "background-selected"
    : color?.colorCode
    ? `color-mix(in srgb, ${color.colorCode} ${isDark ? 22 : 26}%, ${
        isDark ? "#1b1b1b" : "white"
      })`
    : "background-secondary";
  const borderColor = highlighted
    ? color?.colorCode || "accent"
    : color?.colorCode
    ? `color-mix(in srgb, ${color.colorCode} ${isDark ? 45 : 55}%, transparent)`
    : "border";

  const hasActiveReminder = !!(reminder && isReminderActive(reminder));
  const hasExpiry = !!item.expiryDate?.value;
  const visibleNotebooks =
    context?.type !== "notebook" && notebooks?.items ? notebooks.items : [];
  const visibleTags = tags?.items || [];
  const hasChipRow =
    hasActiveReminder ||
    hasExpiry ||
    visibleTags.length > 0 ||
    visibleNotebooks.length > 0;

  return (
    <Flex
      ref={cardRef}
      id={`id_${item.id}`}
      className={isSelected ? "selected" : ""}
      data-test-id="grid-note-card"
      tabIndex={-1}
      title={item.title}
      onClick={(e: MouseEvent<HTMLDivElement>) => {
        if (!e.metaKey && !e.shiftKey && !e.ctrlKey) {
          if (rawContent) {
            useEditorStore.getState().openSession(item.id, {
              rawContent,
              force: true
            });
          } else {
            useEditorStore.getState().openSession(item);
          }
        }
      }}
      onMouseDown={(e: MouseEvent<HTMLDivElement>) => {
        if (e.button === 1) {
          e.preventDefault();
          useEditorStore.getState().openSession(item, { openInNewTab: true });
        }
      }}
      onKeyUp={async (e) => {
        if (e.key === "Delete") {
          await Multiselect.moveNotesToTrash(
            selectionStore.get().selectedItems
          );
        }
      }}
      onContextMenu={async (e) => {
        e.preventDefault();
        e.stopPropagation();

        let title: string | undefined = undefined;
        let selectedItems = selectionStore.get().selectedItems;
        if (selectedItems.findIndex((i) => i === item.id) === -1) {
          selectedItems = [item.id];
        }

        let menuItems = await noteMenuItems(item, selectedItems, {
          color,
          locked
        });
        if (selectedItems.length > 1) {
          title = strings.itemsSelected(selectedItems.length);
          menuItems = menuItems?.filter((i) => i.multiSelect === true);
        }
        if (!menuItems) return;

        openMenu(menuItems, { title });
      }}
      sx={{
        height: "100%",
        boxSizing: "border-box",
        flexDirection: "column",
        justifyContent: "space-between",
        borderRadius: 4,
        p: "10px 12px",
        bg: background,
        border: highlighted ? "2px solid" : "1px solid",
        borderColor,
        color: "heading",
        cursor: "pointer",
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.22)",
        ":hover": { filter: isDark ? "brightness(1.08)" : "brightness(0.97)" }
      }}
    >
      <Flex sx={{ flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}>
        <Flex sx={{ alignItems: "center", justifyContent: "space-between", gap: "6px", flexShrink: 0 }}>
          <Text
            data-test-id="title"
            sx={{
              display: "block",
              flex: 1,
              minWidth: 0,
              fontWeight: 700,
              fontSize: 14.5,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "heading",
              ".match": {
                bg: "accent-secondary",
                color: "accentForeground-secondary"
              }
            }}
          >
            {titleOverride || item.title || strings.untitled()}
          </Text>
          {badgeText ? (
            <Text
              variant="subBody"
              sx={{
                flexShrink: 0,
                fontSize: 11,
                fontWeight: 600,
                color: primary
              }}
            >
              {badgeText}
            </Text>
          ) : null}
        </Flex>
        <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          {locked ? (
            <Text
              sx={{
                display: "block",
                fontSize: 12,
                fontStyle: "italic",
                mt: "8px",
                color: "paragraph-secondary"
              }}
            >
              {strings.noteLocked()}
            </Text>
          ) : bodyPreview ? (
            <Text
              data-test-id="description"
              sx={{
                display: "-webkit-box",
                WebkitBoxOrient: "vertical",
                WebkitLineClamp: hasChipRow ? 5 : 6,
                overflow: "hidden",
                whiteSpace: "pre-line",
                fontSize: 12.5,
                lineHeight: 1.36,
                mt: "6px",
                color: "paragraph"
              }}
            >
              {bodyPreview}
            </Text>
          ) : null}
        </div>
      </Flex>

      <Flex
        sx={{
          flexDirection: "column",
          gap: "4px",
          mt: "6px",
          flexShrink: 0
        }}
      >
        {hasChipRow && (
          <Flex
            sx={{
              alignItems: "center",
              gap: "4px",
              flexWrap: "wrap",
              maxHeight: "42px",
              overflow: "hidden"
            }}
          >
            {visibleTags.map((tag) => (
              <IconTag
                testId="tag-item"
                key={tag.id}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!tag.id) return showToast("error", strings.tagNotFound());
                  appStore.get().setNavigationTab("tags");
                  navigate(`/tags/${tag.id}`);
                }}
                text={tag.title}
                title={strings.goToTag(tag.title)}
                icon={TagIcon}
              />
            ))}
            {visibleNotebooks.map((notebook) => (
              <IconTag
                key={notebook.id}
                onClick={(e) => {
                  e.stopPropagation();
                  appStore.get().setNavigationTab("notebooks");
                  navigate(`/notebooks/${notebook.id}`);
                }}
                text={notebook.title}
                icon={Notebook}
              />
            ))}
            {hasActiveReminder && reminder ? (
              <IconTag
                icon={Reminder}
                text={getFormattedReminderTime(reminder, true)}
                title={reminder.title}
                styles={
                  isReminderToday(reminder)
                    ? {
                        icon: { color: primary },
                        text: { color: primary }
                      }
                    : {}
                }
              />
            ) : null}
            {item.expiryDate?.value ? (
              <IconTag
                icon={Destruct}
                text={formatDate(item.expiryDate.value, {
                  type: "date",
                  dateFormat
                })}
              />
            ) : null}
          </Flex>
        )}

        <Flex
          sx={{
            fontSize: "subBody",
            color: "paragraph-secondary",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "6px",
            minWidth: 0
          }}
        >
          <Text sx={{ fontSize: 11, color: "paragraph-secondary", flexShrink: 0 }}>
            {formatDate(date, { type: "date", dateFormat })}
          </Text>
          <Flex
            sx={{
              alignItems: "center",
              gap: "5px",
              flexShrink: 0,
              color: "paragraph-secondary"
            }}
          >
            {item.conflicted && (
              <Alert size={14} color="var(--icon-error)" />
            )}
            {item.localOnly && <SyncOff size={13} />}
            {attachments?.total ? (
              <Flex
                data-test-id="attachments-count"
                sx={{ alignItems: "center", justifyContent: "center" }}
              >
                <Attachment size={13} />
                <Text variant="subBody" ml="2px">
                  {attachments.total}
                </Text>
              </Flex>
            ) : null}
            {attachments?.failed ? (
              <Flex title={strings.errorsInAttachments(attachments.failed)}>
                <AttachmentError size={13} color="var(--icon-error)" />
                <Text ml="2px">{attachments.failed}</Text>
              </Flex>
            ) : null}
            {item.pinned && !context && <Pin size={13} />}
            {locked && <Lock size={13} data-test-id="locked" />}
            {item.readonly && <Readonly size={14} />}
            {item.favorite && (
              <Star data-test-id="favorite" color={primary} size={14} />
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}
