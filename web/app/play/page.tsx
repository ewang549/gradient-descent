import type { Metadata } from "next";
import { Play } from "@/components/play/Play";

const title = "You Make the Call: can you beat NFL coaches on 4th down?";
const description = "Real 4th downs from 2025-26. Go, punt or kick, then see the win probability of every option and what the coach did. New daily 5 every day.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  openGraph: { title, description, images: [{ url: "/og/play", width: 1200, height: 675 }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og/play"] },
};

export default function PlayPage() {
  return (
    <main className="relative">
      <Play />
    </main>
  );
}
