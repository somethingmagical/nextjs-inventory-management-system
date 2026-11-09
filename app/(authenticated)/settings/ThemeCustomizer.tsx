"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { RotateCcw } from "lucide-react";
import {
  applyThemeColors,
  DEFAULT_THEME_COLORS,
  parseThemeColors,
  THEME_STORAGE_KEY,
  type ThemeColors,
  type ThemeMode,
  THEME_MODE_COLORS,
} from "@/components/layout/theme-colors";

type ThemeColorKey = Exclude<keyof ThemeColors, "mode">;

const colorGroups: { title: string; options: { key: ThemeColorKey; label: string }[] }[] = [
  {
    title: "Interface",
    options: [
      { key: "primary", label: "Primary and actions" },
      { key: "canvas", label: "Page background" },
      { key: "surface", label: "Cards and panels" },
      { key: "text", label: "Headings and header text" },
      { key: "icons", label: "Header and sidebar icons" },
    ],
  },
  {
    title: "Dashboard cards",
    options: [
      { key: "cardSales", label: "Sales" },
      { key: "cardPurchases", label: "Purchases" },
      { key: "cardSalesReturns", label: "Sales returns" },
      { key: "cardPurchaseReturns", label: "Purchase returns" },
      { key: "cardTodaySales", label: "Today sales" },
      { key: "cardTodayReceived", label: "Today received" },
      { key: "cardTodayPurchases", label: "Today purchases" },
      { key: "cardTodayExpenses", label: "Today expenses" },
    ],
  },
  {
    title: "Dashboard graphs and charts",
    options: [
      { key: "chart1", label: "Chart color 1" },
      { key: "chart2", label: "Chart color 2" },
      { key: "chart3", label: "Chart color 3" },
      { key: "chart4", label: "Chart color 4" },
      { key: "chart5", label: "Chart color 5" },
    ],
  },
];

const themeModes: { value: ThemeMode; label: string; description: string }[] = [
  { value: "original", label: "Original Theme", description: "Current green and warm neutral palette" },
  { value: "light", label: "Light Theme", description: "Clean blue and cool neutral palette" },
  { value: "dark", label: "Dark Theme", description: "Dark surfaces with readable light text" },
];

export default function ThemeCustomizer() {
  const [colors, setColors] = useState(DEFAULT_THEME_COLORS);
  const [status, setStatus] = useState("");

  useEffect(() => {
    try {
      const savedColors = parseThemeColors(
        window.localStorage.getItem(THEME_STORAGE_KEY),
      );
      if (savedColors) {
        setColors(savedColors);
        applyThemeColors(savedColors);
      }
    } catch (error) {
      console.error("Saved theme colors could not be loaded.", error);
      setStatus("Saved colors could not be loaded from this browser.");
    }
  }, []);

  function saveColors(updatedColors: ThemeColors, message: string) {
    setColors(updatedColors);
    applyThemeColors(updatedColors);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(updatedColors));
      setStatus(message);
    } catch (error) {
      console.error("Theme colors could not be saved in this browser.", error);
      setStatus("Theme updated for this session, but could not be saved in this browser.");
    }
  }

  function updateColor(key: ThemeColorKey, event: ChangeEvent<HTMLInputElement>) {
    const updatedColors = { ...colors, [key]: event.currentTarget.value };
    saveColors(updatedColors, "Theme updated and saved in this browser.");
  }

  function selectThemeMode(mode: ThemeMode) {
    saveColors(
      { ...colors, ...THEME_MODE_COLORS[mode], mode },
      `${themeModes.find((theme) => theme.value === mode)?.label} applied.`,
    );
  }

  function resetTheme() {
    saveColors(DEFAULT_THEME_COLORS, "Theme reset to the default colors.");
  }

  return (
    <section className="gg-card gg-card-pad theme-customizer" aria-labelledby="theme-customizer-title">
      <div className="theme-customizer-head">
        <div>
          <h2 className="gg-card-title" id="theme-customizer-title">Theme customizer</h2>
          <p className="gg-caption theme-customizer-description">
            Customize interface colors, dashboard cards, and chart palettes. Header background follows Cards and panels. Changes apply instantly and are saved in this browser.
          </p>
        </div>
        <button className="gg-btn gg-btn--secondary gg-btn--sm" type="button" onClick={resetTheme}>
          <RotateCcw size={15} aria-hidden="true" />
          Reset
        </button>
      </div>

      <fieldset className="theme-mode-group">
        <legend className="gg-label">Theme mode</legend>
        <div className="theme-mode-options" role="group" aria-label="Theme mode">
          {themeModes.map(({ value, label, description }) => (
            <button
              className={`theme-mode-option${colors.mode === value ? " is-active" : ""}`}
              type="button"
              aria-pressed={colors.mode === value}
              onClick={() => selectThemeMode(value)}
              key={value}
            >
              <span className={`theme-mode-swatch theme-mode-swatch--${value}`} aria-hidden="true">
                <span />
                <span />
              </span>
              <span className="theme-mode-copy">
                <span className="theme-mode-label">{label}</span>
                <span className="theme-mode-description">{description}</span>
              </span>
            </button>
          ))}
        </div>
      </fieldset>

      {colorGroups.map(({ title, options }) => (
        <fieldset className="theme-color-group" key={title}>
          <legend className="gg-label">{title}</legend>
          <div className="theme-color-grid">
            {options.map(({ key, label }) => (
              <label className="theme-color-control" key={key}>
                <span>{label}</span>
                <input
                  className="theme-color-input"
                  type="color"
                  value={colors[key]}
                  onChange={(event) => updateColor(key, event)}
                  aria-label={label}
                />
                <span>{colors[key].toUpperCase()}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <span className="gg-caption theme-customizer-status" role="status" aria-live="polite">
        {status}
      </span>
    </section>
  );
}
