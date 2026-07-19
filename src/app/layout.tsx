import type { Metadata } from "next";
import { Space_Grotesk, Geist_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SfxProvider } from "@/components/SfxProvider";
import { ToastProvider } from "@/components/ToastProvider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AIDemic - AI-Powered Study Companion",
  description: "Study smarter with AI-powered learning tools, flashcards, and personalized Flashcard reviews.",
};

const themeInitializer = `
(() => {
  const root = document.documentElement;
  const stored = window.localStorage.getItem("aidemic-theme");
  const isDark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.remove("light", "dark");
  root.classList.add(isDark ? "dark" : "light");
  root.style.colorScheme = isDark ? "dark" : "light";
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
      </head>
      <body className={`${spaceGrotesk.variable} ${geistMono.variable} flex min-h-screen flex-col antialiased`}>
        <SfxProvider>
          <ToastProvider>{children}</ToastProvider>
        </SfxProvider>
      </body>
    </html>
  );
}
