import type { Metadata } from "next";
import { Archivo, Bodoni_Moda } from "next/font/google";
import { CookieBanner } from "@/components/CookieBanner";
import { SITE } from "@/lib/site";
import "./globals.css";

const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"], variable: "--font-bodoni" });
const archivo = Archivo({ weight: ["400", "500", "700"], subsets: ["latin"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: { default: `${SITE.name}. ${SITE.strap}.`, template: `%s. ${SITE.name}.` },
  description: "Local businesses and gear brands put money behind working musicians in New York.",
  metadataBase: new URL(SITE.url),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bodoni.variable} ${archivo.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}
