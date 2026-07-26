import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIDemic — AI Revision Coach",
    short_name: "AIDemic",
    description:
      "Plan your revision, generate notes and flashcards, review with spaced repetition, and practise exam questions with instant AI feedback.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0A0F1E",
    theme_color: "#6366F1",
    orientation: "portrait",
    categories: ["education", "productivity"],
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any", purpose: "any" },
    ],
  };
}
