/**
 * One renderer for every image: next/og's ImageResponse (Satori + resvg). The weekly card script
 * and the live /og routes both call this, so a card PNG and a link preview are drawn by the same
 * code with the same fonts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import type { ReactElement } from "react";

export const CARD_WIDTH = 1200; // X's 16:9 large summary card
export const CARD_HEIGHT = 675;

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");

type Weight = 400 | 500 | 600 | 700 | 800 | 900;
let fonts: { name: string; data: Buffer; weight: Weight; style: "normal" }[] | null = null;

function loadFonts() {
  fonts ??= [
    ...([600, 800, 900] as const).map((weight) => ({
      name: "Big Shoulders", weight, style: "normal" as const,
      data: readFileSync(path.join(FONT_DIR, `big-shoulders-latin-${weight}-normal.woff`)),
    })),
    ...([400, 500, 600, 700] as const).map((weight) => ({
      name: "Instrument Sans", weight, style: "normal" as const,
      data: readFileSync(path.join(FONT_DIR, `instrument-sans-latin-${weight}-normal.woff`)),
    })),
  ];
  return fonts;
}

export function cardResponse(element: ReactElement, headers?: Record<string, string>): ImageResponse {
  return new ImageResponse(element, { width: CARD_WIDTH, height: CARD_HEIGHT, fonts: loadFonts(), headers });
}

export async function renderPng(element: ReactElement): Promise<Buffer> {
  return Buffer.from(await cardResponse(element).arrayBuffer());
}
