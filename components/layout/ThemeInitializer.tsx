"use client";

import { useEffect } from "react";
import {
  applyThemeColors,
  parseThemeColors,
  THEME_STORAGE_KEY,
} from "./theme-colors";

export default function ThemeInitializer() {
  useEffect(() => {
    try {
      const colors = parseThemeColors(
        window.localStorage.getItem(THEME_STORAGE_KEY),
      );
      if (colors) applyThemeColors(colors);
    } catch (error) {
      console.error("Saved theme colors could not be loaded.", error);
    }
  }, []);

  return null;
}
