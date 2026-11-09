export type ThemeMode = "original" | "light" | "dark";

export type ThemeColors = {
  mode: ThemeMode;
  primary: string;
  canvas: string;
  surface: string;
  text: string;
  icons: string;
  cardSales: string;
  cardPurchases: string;
  cardSalesReturns: string;
  cardPurchaseReturns: string;
  cardTodaySales: string;
  cardTodayReceived: string;
  cardTodayPurchases: string;
  cardTodayExpenses: string;
  chart1: string;
  chart2: string;
  chart3: string;
  chart4: string;
  chart5: string;
};

export const THEME_STORAGE_KEY = "inventory-theme-colors";

export const DEFAULT_THEME_COLORS: ThemeColors = {
  mode: "original",
  primary: "#3D733A",
  canvas: "#F6F4EE",
  surface: "#FFFFFF",
  text: "#1C1A16",
  icons: "#5E594F",
  cardSales: "#C0851A",
  cardPurchases: "#109C6B",
  cardSalesReturns: "#2C7BE0",
  cardPurchaseReturns: "#DE7A1E",
  cardTodaySales: "#6D5BD0",
  cardTodayReceived: "#DD4F88",
  cardTodayPurchases: "#1BA3C2",
  cardTodayExpenses: "#D8473A",
  chart1: "#6D5BD0",
  chart2: "#C0851A",
  chart3: "#109C6B",
  chart4: "#2C7BE0",
  chart5: "#DD4F88",
};

export const THEME_MODE_COLORS: Record<ThemeMode, Pick<ThemeColors, "primary" | "canvas" | "surface" | "text" | "icons">> = {
  original: {
    primary: DEFAULT_THEME_COLORS.primary,
    canvas: DEFAULT_THEME_COLORS.canvas,
    surface: DEFAULT_THEME_COLORS.surface,
    text: DEFAULT_THEME_COLORS.text,
    icons: DEFAULT_THEME_COLORS.icons,
  },
  light: {
    primary: "#3568B8",
    canvas: "#F2F5FA",
    surface: "#FFFFFF",
    text: "#202938",
    icons: "#5B687A",
  },
  dark: {
    primary: "#4D8A4A",
    canvas: "#171C23",
    surface: "#222A34",
    text: "#EDF1F5",
    icons: "#B7C1CE",
  },
};

const hexColorPattern = /^#[\da-f]{6}$/i;
const themeModes: ThemeMode[] = ["original", "light", "dark"];

function mixColors(color: string, mixWith: string, weight: number) {
  const channels = (value: string) =>
    value.slice(1).match(/.{2}/g)?.map((channel) => Number.parseInt(channel, 16)) ?? [];
  const colorChannels = channels(color);
  const mixChannels = channels(mixWith);

  return `#${colorChannels
    .map((channel, index) =>
      Math.round(channel * weight + mixChannels[index] * (1 - weight))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function rgbColor(color: string) {
  const [red, green, blue] = color.slice(1).match(/.{2}/g)!.map((channel) =>
    Number.parseInt(channel, 16),
  );
  return `${red}, ${green}, ${blue}`;
}

export function applyThemeColors(colors: ThemeColors) {
  const root = document.documentElement;
  const neutralColors = colors.mode === "dark"
    ? {
        "--gray-900": "#EDF1F5",
        "--gray-800": "#E1E6EC",
        "--gray-700": colors.text,
        "--gray-600": "#B7C1CE",
        "--gray-500": "#929EAD",
        "--gray-400": "#788595",
        "--gray-300": "#4A5664",
        "--gray-200": "#3A4552",
        "--gray-150": "#303B47",
        "--gray-100": "#29333F",
        "--gray-50": "#323E4B",
      }
    : colors.mode === "light"
      ? {
          "--gray-900": "#202938",
          "--gray-800": "#303B4C",
          "--gray-700": "#435064",
          "--gray-600": "#5B687A",
          "--gray-500": "#758196",
          "--gray-400": "#97A2B1",
          "--gray-300": "#C7D0DC",
          "--gray-200": "#DDE4ED",
          "--gray-150": "#E7ECF3",
          "--gray-100": "#EDF1F6",
          "--gray-50": "#F6F8FB",
        }
      : {
          "--gray-900": "#221F1A",
          "--gray-800": "#322E27",
          "--gray-700": colors.text,
          "--gray-600": "#5E594F",
          "--gray-500": "#7A746A",
          "--gray-400": "#A39C90",
          "--gray-300": "#D4CEC3",
          "--gray-200": "#E6E1D8",
          "--gray-150": "#EEEAE2",
          "--gray-100": "#F3F0E9",
          "--gray-50": "#F8F6F1",
        };
  const palette = {
    "--gold-50": mixColors(colors.primary, "#FFFFFF", 0.04),
    "--gold-100": mixColors(colors.primary, "#FFFFFF", 0.1),
    "--gold-200": mixColors(colors.primary, "#FFFFFF", 0.22),
    "--gold-300": mixColors(colors.primary, "#FFFFFF", 0.42),
    "--gold-400": mixColors(colors.primary, "#FFFFFF", 0.68),
    "--gold-500": mixColors(colors.primary, "#FFFFFF", 0.88),
    "--gold-600": colors.primary,
    "--gold-700": mixColors(colors.primary, "#000000", 0.88),
    "--gold-800": mixColors(colors.primary, "#000000", 0.75),
    "--gold-900": mixColors(colors.primary, "#000000", 0.62),
    "--primary": colors.primary,
    "--primary-hover": mixColors(colors.primary, "#000000", 0.88),
    "--primary-active": mixColors(colors.primary, "#000000", 0.75),
    "--glow": mixColors(colors.primary, "#FFFFFF", 0.68),
    "--ring": `0 0 0 3px rgba(${rgbColor(colors.primary)}, .3)`,
    "--canvas": colors.canvas,
    "--surface": colors.surface,
    "--ink": colors.text,
    ...neutralColors,
    "--header-text": colors.text,
    "--header-icon": colors.icons,
    "--sidebar-icon": colors.icons,
    "--tile-gold": colors.cardSales,
    "--tile-emerald": colors.cardPurchases,
    "--tile-blue": colors.cardSalesReturns,
    "--tile-orange": colors.cardPurchaseReturns,
    "--tile-violet": colors.cardTodaySales,
    "--tile-rose": colors.cardTodayReceived,
    "--tile-cyan": colors.cardTodayPurchases,
    "--tile-red": colors.cardTodayExpenses,
    "--dashboard-chart-1": colors.chart1,
    "--dashboard-chart-2": colors.chart2,
    "--dashboard-chart-3": colors.chart3,
    "--dashboard-chart-4": colors.chart4,
    "--dashboard-chart-5": colors.chart5,
  };

  for (const [property, value] of Object.entries(palette)) {
    root.style.setProperty(property, value);
  }

  window.dispatchEvent(new Event("inventory-theme-change"));
}

export function parseThemeColors(value: string | null): ThemeColors | null {
  if (!value) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    console.error("Saved theme colors could not be parsed.", error);
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) {
    console.error("Saved theme colors were invalid.");
    return null;
  }

  const savedColors = parsed as Record<string, unknown>;
  const colors = { ...DEFAULT_THEME_COLORS };
  if (savedColors.mode !== undefined) {
    if (typeof savedColors.mode !== "string" || !themeModes.includes(savedColors.mode as ThemeMode)) {
      console.error("Saved theme mode was invalid.");
      return null;
    }
    colors.mode = savedColors.mode as ThemeMode;
  }
  for (const key of Object.keys(DEFAULT_THEME_COLORS) as (keyof ThemeColors)[]) {
    if (key === "mode") continue;
    const color = key === "icons"
      ? savedColors.icons ?? savedColors.headerIcon ?? savedColors.sidebarIcon
      : savedColors[key];
    if (color === undefined) continue;
    if (typeof color !== "string" || !hexColorPattern.test(color)) {
      console.error("Saved theme colors were invalid.");
      return null;
    }
    colors[key] = color;
  }

  return colors;
}
