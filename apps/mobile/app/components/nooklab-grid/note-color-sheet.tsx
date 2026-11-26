/*
 * NookLab — quick bottom sheet to view, set, create, or clear the active
 * note's ColorNote color directly from the mobile editor toolbar.
 */
import { Color, Note } from "@notesnook/core";
import { useThemeColors } from "@notesnook/theme";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { db } from "../../common/database";
import {
  eSendEvent,
  sendItemUpdateEvent
} from "../../services/event-manager";
import Navigation from "../../services/navigation";
import { useMenuStore } from "../../stores/use-menu-store";
import { useRelationStore } from "../../stores/use-relation-store";
import { useSettingStore } from "../../stores/use-setting-store";
import { refreshNotesPage } from "../../utils/events";
import { AppFontSize } from "../../utils/size";
import { DefaultAppStyles } from "../../utils/styles";
import ColorPicker from "../dialogs/color-picker";
import { Pressable } from "../ui/pressable";
import Heading from "../ui/typography/heading";
import Paragraph from "../ui/typography/paragraph";

const PRESET_NOTE_COLORS = [
  { title: "Red", colorCode: "#dc2626" },
  { title: "Orange", colorCode: "#f97316" },
  { title: "Yellow", colorCode: "#eab308" },
  { title: "Green", colorCode: "#22c55e" },
  { title: "Blue", colorCode: "#3b82f6" },
  { title: "Purple", colorCode: "#a855f7" },
  { title: "Gray", colorCode: "#64748b" }
];

export const NookLabNoteColorSheet = ({
  note,
  onColorUpdated,
  close
}: {
  note: Note;
  onColorUpdated: (color: Color | null) => void;
  close?: () => void;
}) => {
  const { colors } = useThemeColors();
  const colorNotes = useMenuStore((state) => state.colorNotes);
  const setColorNotes = useMenuStore((state) => state.setColorNotes);
  const [activeColor, setActiveColor] = useState<Color | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    setColorNotes();
    db.relations
      .to(note, "color")
      .resolve()
      .then((list) => setActiveColor(list[0] || null))
      .catch(() => {});
  }, [note, setColorNotes]);

  const applyColor = async (color: Color | null) => {
    await db.relations.to(note, "color").unlink();

    const isSame = color && activeColor?.id === color.id;
    const nextColor = color && !isSame ? color : null;
    if (nextColor) {
      await db.relations.add(nextColor, note);
    }

    setActiveColor(nextColor);
    useRelationStore.getState().update();
    setColorNotes();
    Navigation.queueRoutesForUpdate();
    if (color) {
      sendItemUpdateEvent(color.id, "color");
    }
    eSendEvent(refreshNotesPage);
    onColorUpdated(nextColor);
    close?.();
  };

  const applyPreset = async (preset: { title: string; colorCode: string }) => {
    const existing = colorNotes.find(
      (c) => c.colorCode.toLowerCase() === preset.colorCode.toLowerCase()
    );
    if (existing) {
      await applyColor(existing);
      return;
    }

    const id = await db.colors.add({
      title: preset.title,
      colorCode: preset.colorCode
    });
    if (!id) return;
    const created = await db.colors.color(id);
    if (!created) return;
    await applyColor(created);
  };

  const savedHexes = new Set(
    colorNotes.map((c) => c.colorCode.toLowerCase())
  );
  const missingPresets = PRESET_NOTE_COLORS.filter(
    (p) => !savedHexes.has(p.colorCode.toLowerCase())
  );

  return (
    <>
      <ColorPicker
        visible={pickerVisible}
        setVisible={setPickerVisible}
        onColorAdded={async (created) => {
          setColorNotes();
          await applyColor(created);
        }}
      />

      <View
        style={{
          paddingHorizontal: DefaultAppStyles.GAP,
          paddingTop: 8,
          paddingBottom: 20,
          gap: 14
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <Heading size={AppFontSize.md}>Note color</Heading>
          {activeColor ? (
            <Pressable
              type="secondary"
              onPress={() => applyColor(null)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4
              }}
            >
              <Icon name="close" size={14} color={colors.primary.icon} />
              <Paragraph size={AppFontSize.xs}>Clear</Paragraph>
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10
          }}
        >
          {colorNotes.map((item) => {
            const selected = activeColor?.id === item.id;
            return (
              <Pressable
                key={item.id}
                type="accent"
                accentColor={item.colorCode}
                accentText={colors.static.white}
                onPress={() => applyColor(item)}
                style={{
                  minWidth: 92,
                  height: 40,
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderWidth: selected ? 2 : 0,
                  borderColor: colors.static.white
                }}
              >
                {selected ? (
                  <Icon name="check" color="white" size={16} />
                ) : null}
                <Paragraph
                  size={AppFontSize.xs}
                  color="white"
                  numberOfLines={1}
                  style={{ fontWeight: "700" }}
                >
                  {item.title}
                </Paragraph>
              </Pressable>
            );
          })}

          {missingPresets.map((preset) => (
            <Pressable
              key={preset.colorCode}
              type="accent"
              accentColor={preset.colorCode}
              accentText={colors.static.white}
              onPress={() => applyPreset(preset)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                justifyContent: "center",
                alignItems: "center"
              }}
            />
          ))}

          <Pressable
            type="secondary"
            onPress={() => {
              useSettingStore.getState().setSheetKeyboardHandler(false);
              setPickerVisible(true);
            }}
            style={{
              height: 40,
              paddingHorizontal: 12,
              borderRadius: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              borderWidth: 1,
              borderColor: colors.primary.border
            }}
          >
            <Icon name="plus" size={18} color={colors.primary.icon} />
            <Paragraph size={AppFontSize.xs}>New color</Paragraph>
          </Pressable>
        </View>
      </View>
    </>
  );
};
