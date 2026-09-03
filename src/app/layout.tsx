import type { Metadata } from "next";
import { Anton, Archivo, Special_Elite } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const specialElite = Special_Elite({ weight: "400", subsets: ["latin"], variable: "--font-special-elite" });
const archivo = Archivo({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: `${SITE.name}. ${SITE.strap}.`, template: `%s. ${SITE.name}.` },
  description: "Local businesses and gear brands put money behind working musicians in New York.",
  metadataBase: new URL(SITE.url),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${anton.variable} ${specialElite.variable} ${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
