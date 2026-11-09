import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getApplicationSettings } from "@/features/settings/application";
import ThemeInitializer from "@/components/layout/ThemeInitializer";
import "./globals.css";
import "./customstyle.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function getMetadataBase(): URL | undefined {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) {
    return new URL("http://localhost:3000");
  }

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("Expected an HTTP or HTTPS URL.");
    }
    return url;
  } catch {
    console.warn(
      "NEXT_PUBLIC_APP_URL must be an absolute HTTP(S) URL. Omitting metadataBase.",
    );
    return undefined;
  }
}

const metadataBase = getMetadataBase();

export async function generateMetadata(): Promise<Metadata> {
  const { appName, faviconPath } = await getApplicationSettings();

  return {
    metadataBase,
    title: {
      default: `Sign In | ${appName}`,
      template: `%s | ${appName}`,
    },
    description: `Sign in to the ${appName} workspace`,
    icons: { icon: faviconPath },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}
