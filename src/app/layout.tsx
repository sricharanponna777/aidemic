import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "katex/dist/katex.min.css";
import "./globals.css";
import { SfxProvider } from "@/components/SfxProvider";
import { ToastProvider } from "@/components/ToastProvider";

// Self-hosted rather than next/font/google: that helper fetches the font files from
// fonts.gstatic.com during `next build`, so a build could only succeed with outbound
// network access and could silently pick up a different file revision over time.
// These are the same latin-subset variable faces, committed to the repo.
const spaceGrotesk = localFont({
  src: "./fonts/SpaceGrotesk-latin-variable.woff2",
  variable: "--font-space-grotesk",
  weight: "300 700", // one variable file spans the whole range
  display: "swap",
  fallback: ["system-ui", "sans-serif"],
});

const geistMono = localFont({
  src: "./fonts/GeistMono-latin-variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
  fallback: ["ui-monospace", "monospace"],
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
