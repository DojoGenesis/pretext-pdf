/**
 * Font management for Pretext PDF export.
 *
 * Manages font loading, registration with node-canvas (for Pretext measurement),
 * and CSS font string construction for the three primary variable font families:
 * - Inter (body text)
 * - Recursive (code)
 * - Fraunces (display/headings)
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerFontFile, cssFontString } from "./pretext-bridge.js";

// Resolve fonts dir relative to this module, not process.cwd().
// Compiled to dist/typography/fonts.js → ../../fonts = PretextPDFByDojoGenesis/fonts/
const __moduleDir = dirname(fileURLToPath(import.meta.url));

export interface FontStack {
  body: FontConfig;
  code: FontConfig;
  codeMono: FontConfig; // Pre-instanced monospace for PDF embedding
  display: FontConfig;
}

export interface FontConfig {
  family: string;
  path: string | null; // null = font not bundled, use system fallback
  fallback: string[];
}

const DEFAULT_FONT_STACK: FontStack = {
  body: {
    family: "Inter",
    path: null,
    fallback: ["Helvetica Neue", "Arial", "sans-serif"],
  },
  code: {
    family: "Recursive",
    path: null,
    fallback: ["SF Mono", "Menlo", "Consolas", "monospace"],
  },
  codeMono: {
    family: "RecursiveMono",
    path: null,
    fallback: ["SF Mono", "Menlo", "Consolas", "monospace"],
  },
  display: {
    family: "Fraunces",
    path: null,
    fallback: ["Georgia", "Times New Roman", "serif"],
  },
};

/**
 * Load and register bundled font files with node-canvas.
 * If fonts aren't found, falls back to system fonts.
 */
export function loadFonts(fontDir?: string): FontStack {
  const stack: FontStack = {
    body: { ...DEFAULT_FONT_STACK.body },
    code: { ...DEFAULT_FONT_STACK.code },
    codeMono: { ...DEFAULT_FONT_STACK.codeMono },
    display: { ...DEFAULT_FONT_STACK.display },
  };
  const dir = fontDir ?? join(__moduleDir, "../../fonts");

  if (!existsSync(dir)) {
    return stack;
  }

  const fontFiles: Array<{
    filename: string;
    family: string;
    key: keyof FontStack;
  }> = [
    { filename: "Inter-Variable.ttf", family: "Inter", key: "body" },
    { filename: "Recursive-Variable.ttf", family: "Recursive", key: "code" },
    { filename: "RecursiveMono-Regular.ttf", family: "RecursiveMono", key: "codeMono" },
    { filename: "Fraunces-Variable.ttf", family: "Fraunces", key: "display" },
  ];

  for (const { filename, family, key } of fontFiles) {
    const fontPath = join(dir, filename);
    if (existsSync(fontPath)) {
      registerFontFile(fontPath, family);
      stack[key] = { ...stack[key], path: fontPath };
    }
  }

  return stack;
}

/**
 * Build CSS font strings for Pretext measurement.
 * These strings are passed to prepare() / prepareWithSegments().
 */
export function buildFontStrings(
  fontStack: FontStack,
  fontSize: number,
  codeFontSize: number,
  headingScale: number[]
) {
  const bodyFamily = fontStack.body.family;
  const codeFamily = fontStack.code.family;
  const displayFamily = fontStack.display.family;

  return {
    body: cssFontString(bodyFamily, fontSize),
    bodyBold: cssFontString(bodyFamily, fontSize, 700),
    code: cssFontString(codeFamily, codeFontSize),
    heading: (level: number) => {
      const scale = headingScale[Math.min(level - 1, 5)] ?? 1;
      const size = fontSize * scale;
      const weight = level <= 2 ? 700 : level <= 4 ? 600 : 500;
      return cssFontString(displayFamily, size, weight);
    },
  };
}

export { DEFAULT_FONT_STACK };
