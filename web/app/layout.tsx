import type { Metadata, Viewport } from "next";
import { Big_Shoulders, Instrument_Sans } from "next/font/google";
import "./globals.css";

const display = Big_Shoulders({ variable: "--font-big-shoulders", subsets: ["latin"], weight: ["600", "800", "900"] });
const body = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "4th Down Calculator",
  description: "Go for it, punt, or kick? Win probability for every option on any 4th down, computed in your browser.",
};

export const viewport: Viewport = { themeColor: "#0d1321" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="stadium min-h-full">{children}</body>
    </html>
  );
}
