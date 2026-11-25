/*
 * NookLab — red (#dc2626) default light and dark themes derived cleanly from
 * @notesnook/theme without modifying upstream package theme JSONs.
 */
import { ThemeDark, ThemeDefinition, ThemeLight } from "@notesnook/theme";

export const NOOKLAB_ACCENT = "#dc2626";
export const NOOKLAB_LIGHT_THEME_ID = "nooklab-light";
export const NOOKLAB_DARK_THEME_ID = "nooklab-dark";

function rebrandTheme(
  base: ThemeDefinition,
  id: string,
  name: string
): ThemeDefinition {
  const cloned = JSON.parse(
    JSON.stringify(base).replace(/#008837/gi, NOOKLAB_ACCENT)
  ) as ThemeDefinition;
  cloned.id = id;
  cloned.name = name;
  cloned.homepage = "https://nooklab.duckdns.org";
  return cloned;
}

export const NookLabLightTheme: ThemeDefinition = rebrandTheme(
  ThemeLight,
  NOOKLAB_LIGHT_THEME_ID,
  "NookLab Light"
);

export const NookLabDarkTheme: ThemeDefinition = rebrandTheme(
  ThemeDark,
  NOOKLAB_DARK_THEME_ID,
  "NookLab Dark"
);
