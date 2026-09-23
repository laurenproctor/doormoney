import type { Metadata } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { CookieBanner } from "@/components/CookieBanner";
import { MODE_SCRIPT } from "@/lib/mode";
import { SITE } from "@/lib/site";
import { STARTING_CATEGORIES_LIST } from "@/lib/starting-categories";
import "./globals.css";

const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-bodoni" });
const archivo = Archivo({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: `${SITE.name}. ${SITE.strap}.`, template: `%s. ${SITE.name}.` },
  description: `${SITE.taglineSecond} Starting with ${STARTING_CATEGORIES_LIST}, and growing.`,
  metadataBase: new URL(SITE.url),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning because the script below may put data-mode on <html> before React
    // ever sees it. It is the one attribute the server cannot know, and the only thing suppressed.
    <html lang="en" suppressHydrationWarning className={`${bodoni.variable} ${archivo.variable} h-full antialiased`}>
      <head>
        {/* Blocking and inline on purpose: a reader who chose the light room must not be shown the
            dark one for a frame first. See src/lib/mode.ts. */}
        <script dangerouslySetInnerHTML={{ __html: MODE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        {children}
        <CookieBanner />
        <Analytics />
      </body>
    </html>
  );
}
