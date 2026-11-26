/*
 * NookLab — lightweight reactive per-tab note color store for the mobile
 * WebView editor toolbar swatch.
 */
import { create } from "zustand";

export type NookLabToolbarNoteColor = {
  id?: string;
  title?: string;
  colorCode: string;
} | null;

type NoteColorStoreState = {
  colorsByTab: Record<string, NookLabToolbarNoteColor>;
  setTabColor: (tabId: string, color: NookLabToolbarNoteColor) => void;
};

export const useNookLabNoteColorStore = create<NoteColorStoreState>((set) => ({
  colorsByTab: {},
  setTabColor: (tabId, color) =>
    set((state) => ({
      colorsByTab: {
        ...state.colorsByTab,
        [tabId]: color
      }
    }))
}));

export function setTabNoteColor(
  tabId: string,
  color: NookLabToolbarNoteColor
) {
  useNookLabNoteColorStore.getState().setTabColor(tabId, color);
}

export function useTabNoteColor(tabId: string): NookLabToolbarNoteColor {
  return useNookLabNoteColorStore((state) => state.colorsByTab[tabId] || null);
}
