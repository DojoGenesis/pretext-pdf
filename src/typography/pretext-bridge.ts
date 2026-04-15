/**
 * Pretext Bridge — Connects @chenglou/pretext to node-canvas for
 * server-side text measurement and layout computation.
 *
 * Pretext expects either OffscreenCanvas or document.createElement('canvas')
 * for text measurement. In Node.js, we polyfill OffscreenCanvas via the
 * `canvas` package (Cairo-backed).
 *
 * IMPORTANT: Never use `system-ui` as a font family. Canvas and DOM resolve
 * it differently on macOS, causing measurement drift.
 *
 * Real Pretext API (from @chenglou/pretext):
 *   prepare(text, fontString)        → opaque PreparedText (fast-path)
 *   prepareWithSegments(text, font)  → PreparedTextWithSegments (rich-path)
 *   layout(prepared, maxWidth, lh)   → { lineCount, height }
 *   layoutWithLines(prepared, maxWidth, lh) → { lineCount, height, lines[] }
 *   walkLineRanges(prepared, maxWidth, cb)  → lineCount
 *   measureLineStats(prepared, maxWidth)    → { lineCount, maxLineWidth }
 *   measureNaturalWidth(prepared)           → number (intrinsic width)
 */

import { createCanvas, registerFont, type Canvas } from "canvas";

// Re-export Pretext's public types so consumers don't need to import from both
export type {
  PreparedText,
  PreparedTextWithSegments,
  LayoutResult,
  LayoutLinesResult,
  LayoutLine,
  LayoutLineRange,
} from "@chenglou/pretext";

let polyfillApplied = false;

/**
 * Polyfill OffscreenCanvas for Node.js.
 * Pretext's getMeasureContext() checks OffscreenCanvas first (measurement.ts:37).
 * We provide it via the `canvas` package so Pretext can do Canvas text measurement.
 *
 * This is called once at module init — not per-measurement.
 */
function ensureCanvasPolyfill(): void {
  if (polyfillApplied) return;

  if (typeof globalThis.OffscreenCanvas === "undefined") {
    (globalThis as any).OffscreenCanvas = class NodeOffscreenCanvas {
      private canvas: Canvas;
      constructor(width: number, height: number) {
        this.canvas = createCanvas(width, height);
      }
      getContext(type: string) {
        return this.canvas.getContext(type as any);
      }
    };
  }

  polyfillApplied = true;
}

// Apply polyfill immediately on module load
ensureCanvasPolyfill();

// Now we can safely import Pretext (it needs OffscreenCanvas at import time)
const pretext = await import("@chenglou/pretext");

/**
 * Measure text block height using Pretext's fast layout path.
 * ~0.0002ms per call — safe for resize hot paths.
 *
 * @param text - The text content to measure
 * @param font - CSS font string, e.g. "11px Inter" or "700 18px Fraunces"
 * @param maxWidth - Available width in CSS pixels
 * @param lineHeight - Line height in CSS pixels (not a multiplier)
 */
export function measureHeight(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number
): { lineCount: number; height: number } {
  const prepared = pretext.prepare(text, font);
  return pretext.layout(prepared, maxWidth, lineHeight);
}

/**
 * Get full line-by-line layout with text content and widths.
 * More expensive than measureHeight — use only when you need actual line text.
 *
 * @returns lines array where each LayoutLine has { text, width, start, end }
 */
export function layoutLines(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number
): { lineCount: number; height: number; lines: Array<{ text: string; width: number }> } {
  const prepared = pretext.prepareWithSegments(text, font);
  return pretext.layoutWithLines(prepared, maxWidth, lineHeight);
}

/**
 * Compute shrink-wrapped width for a text block.
 * Uses walkLineRanges to find the widest line at the given maxWidth.
 */
export function shrinkWrapWidth(
  text: string,
  font: string,
  maxWidth: number
): { lineCount: number; maxLineWidth: number } {
  const prepared = pretext.prepareWithSegments(text, font);
  let maxLineWidth = 0;
  const lineCount = pretext.walkLineRanges(prepared, maxWidth, (line) => {
    if (line.width > maxLineWidth) maxLineWidth = line.width;
  });
  return { lineCount, maxLineWidth };
}

/**
 * Get the natural (intrinsic) width of text — the widest line
 * when container width is unconstrained.
 */
export function naturalWidth(text: string, font: string): number {
  const prepared = pretext.prepareWithSegments(text, font);
  let maxWidth = 0;
  pretext.walkLineRanges(prepared, Number.POSITIVE_INFINITY, (line) => {
    if (line.width > maxWidth) maxWidth = line.width;
  });
  return maxWidth;
}

/**
 * Register a font file for use in Canvas text measurement.
 * Must be called before prepare() uses the font family name.
 */
export function registerFontFile(
  path: string,
  family: string,
  weight?: string,
  style?: string
): void {
  registerFont(path, {
    family,
    weight: weight ?? "normal",
    style: style ?? "normal",
  });
}

/**
 * Build a CSS font string for Pretext's prepare() function.
 * Pretext expects strings like "11px Inter" or "700 16px Fraunces".
 */
export function cssFontString(
  family: string,
  sizePx: number,
  weight?: number
): string {
  if (weight && weight !== 400) {
    return `${weight} ${sizePx}px ${family}`;
  }
  return `${sizePx}px ${family}`;
}

/**
 * Clear all Pretext caches. Call after registering new fonts or
 * changing locale.
 */
export function clearCaches(): void {
  pretext.clearCache();
}
