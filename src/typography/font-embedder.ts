/**
 * Font Embedder — Embeds custom fonts into PDF documents via pdf-lib + fontkit.
 *
 * Bridges the gap between Canvas measurement (Pretext) and PDF rendering (pdf-lib)
 * by embedding the same font files used for measurement into the final PDF.
 *
 * When fonts are not available, falls back to StandardFonts for BOTH measurement
 * and rendering — never allowing a mismatch.
 */

import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, type PDFFont, StandardFonts } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { FontStack } from "./fonts.js";

export interface EmbeddedFonts {
  body: PDFFont;
  bodyBold: PDFFont;
  code: PDFFont;
  display: PDFFont;
  displayBold: PDFFont;
  /** true if using custom variable fonts, false if using StandardFonts fallback */
  isCustom: boolean;
}

/**
 * Embed fonts into a PDF document. If custom font files are available in the
 * FontStack, embeds them with subsetting. Otherwise falls back to StandardFonts.
 */
export async function embedFonts(
  pdf: PDFDocument,
  fontStack: FontStack
): Promise<EmbeddedFonts> {
  const hasCustomFonts =
    fontStack.body.path !== null &&
    fontStack.display.path !== null;

  if (!hasCustomFonts) {
    return embedStandardFonts(pdf);
  }

  pdf.registerFontkit(fontkit);

  try {
    const fontReads = [
      readFile(fontStack.body.path!),
      readFile(fontStack.display.path!),
    ];
    // Use pre-instanced monospace TTF if available, else fall back to variable
    const codeMonoPath = fontStack.codeMono?.path ?? fontStack.code.path;
    if (codeMonoPath) fontReads.push(readFile(codeMonoPath));

    const [interBytes, frauncesBytes, codeBytes] = await Promise.all(fontReads);

    const body = await pdf.embedFont(interBytes, { subset: true });
    const bodyBold = await pdf.embedFont(interBytes, { subset: true });
    const code = codeBytes
      ? await pdf.embedFont(codeBytes, { subset: true })
      : await pdf.embedFont(StandardFonts.Courier);
    const display = await pdf.embedFont(frauncesBytes, { subset: true });
    const displayBold = await pdf.embedFont(frauncesBytes, { subset: true });

    return { body, bodyBold, code, display, displayBold, isCustom: true };
  } catch (error) {
    console.error("Custom font embedding failed, using standard fonts:", error);
    return embedStandardFonts(pdf);
  }
}

async function embedStandardFonts(pdf: PDFDocument): Promise<EmbeddedFonts> {
  const body = await pdf.embedFont(StandardFonts.Helvetica);
  const bodyBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const code = await pdf.embedFont(StandardFonts.Courier);
  const display = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const displayBold = await pdf.embedFont(StandardFonts.TimesRomanBold);

  return { body, bodyBold, code, display, displayBold, isCustom: false };
}

/**
 * Get the font family names to use for Pretext measurement.
 * When custom fonts are embedded, use their real names.
 * When falling back to StandardFonts, use names that Canvas recognizes.
 */
export function getMeasurementFontNames(isCustom: boolean): {
  body: string;
  code: string;
  display: string;
} {
  if (isCustom) {
    return { body: "Inter", code: "Recursive", display: "Fraunces" };
  }
  // Fallback: use fonts that node-canvas has built-in or system provides
  return { body: "Helvetica", code: "Courier", display: "Times New Roman" };
}
