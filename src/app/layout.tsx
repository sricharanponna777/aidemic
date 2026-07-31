import type { Metadata, Viewport } from "next";
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
  metadataBase: new URL("https://aidemic.co.uk"),
  title: {
    default: "AIDemic — AI Revision Coach",
    template: "%s · AIDemic",
  },
  description:
    "Plan your revision, generate spec-aware notes and flashcards, review with spaced repetition, and practise exam questions with instant AI feedback.",
  applicationName: "AIDemic",
  keywords: ["revision", "GCSE", "A-Level", "flashcards", "spaced repetition", "exam practice", "AI tutor"],
  appleWebApp: {
    capable: true,
    title: "AIDemic",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    type: "website",
    siteName: "AIDemic",
    title: "AIDemic — AI Revision Coach",
    description:
      "Plan your revision, generate spec-aware notes and flashcards, review with spaced repetition, and practise exam questions with instant AI feedback.",
  },
  twitter: {
    card: "summary_large_image",
    title: "AIDemic — AI Revision Coach",
    description:
      "Plan your revision, generate spec-aware notes and flashcards, review with spaced repetition, and practise exam questions with instant AI feedback.",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0F1E" },
  ],
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
