import type { Metadata } from "next";
import { Poppins, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { themeInitScript } from "@/components/theme-toggle";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Tasks",
  description: "AI-powered task management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${poppins.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        {/* Set theme before paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning className="min-h-screen font-sans antialiased text-slate-800 dark:text-slate-200">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
