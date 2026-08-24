import type { Metadata, Viewport } from "next";
import { Noto_Sans_Arabic, Plus_Jakarta_Sans } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-latin", display: "swap" });
const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "English Arabic Translate AI", template: "%s · English Arabic Translate AI" },
  description: "Professional AI-assisted English and Arabic document translation with review and layout preservation.",
  applicationName: "English Arabic Translate AI",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${jakarta.variable} ${arabic.variable} font-[family-name:var(--font-latin),var(--font-arabic),sans-serif] antialiased`}>
        <a
          href="#main-content"
          className="fixed start-4 top-3 z-[100] -translate-y-20 rounded-lg bg-[var(--primary)] px-4 py-2 text-white focus:translate-y-0 dark:text-[#0e1724]"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
