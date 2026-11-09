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

export async function generateMetadata(): Promise<Metadata> {
  const { appName, faviconPath } = await getApplicationSettings();

  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ),
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
