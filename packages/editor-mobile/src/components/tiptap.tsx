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
import { Editor, TiptapOptions, Toolbar, useTiptap } from "@notesnook/editor";
import { useEffect } from "react";
import { useTabContext } from "../hooks/useTabStore";
import { EmotionEditorToolbarTheme } from "../theme-factory";
import { Settings } from "../utils";
import {
  filterPromotedTools,
  NookLabToolbarRow
} from "./nooklab-toolbar-row";
export default function TiptapEditorWrapper(props: {
  options: Partial<TiptapOptions>;
  onEditorUpdate: (editor: Editor) => void;
  settings: Settings;
}) {
  const tab = useTabContext();
  const editor = useTiptap(props.options, [props.options]);
  globalThis.editors[tab.id] = editor;

  useEffect(() => {
    props.onEditorUpdate(editor);
  }, [editor, props]);

  const filteredTools = Array.isArray(props.settings.tools)
    ? filterPromotedTools([...props.settings.tools])
    : [];

  return (
    <>
      {tab.session?.locked ? null : (
        <EmotionEditorToolbarTheme>
          <div
            className="theme-scope-editorToolbar"
            style={{
              display: props.settings.noToolbar ? "none" : "flex",
              flexDirection: "column",
              ...(globalThis.__PLATFORM__ === "ios" && {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0
              })
            }}
          >
            <Toolbar
              className="theme-scope-editorToolbar"
              sx={{
                display: "flex",
                overflowY: "hidden",
                minHeight: "42px"
              }}
              editor={editor}
              location="bottom"
              tools={filteredTools}
              defaultFontFamily={props.settings.fontFamily}
              defaultFontSize={props.settings.fontSize}
            />
            <NookLabToolbarRow editor={editor} />
          </div>
        </EmotionEditorToolbarTheme>
      )}
    </>
  );
}
