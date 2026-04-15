/**
 * Export-PDF Tool — Orchestrates the full pipeline:
 * file reading → renderer selection → Pretext measurement → PDF generation.
 *
 * Pretext integration:
 * - measureHeight() for page break decisions (fast path, ~0.0002ms)
 * - layoutLines() for actual text rendering (provides line text + widths)
 * - shrinkWrapWidth() for chat bubble sizing
 *
 * Font pipeline:
 * - loadFonts() registers font files with node-canvas (for Pretext)
 * - embedFonts() embeds same files into PDF (for pdf-lib rendering)
 * - Both use the same .ttf files → measurement matches rendering
 */

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { PDFDocument, type PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";

import { selectRenderer, PAGE_SIZES } from "../renderers/index.js";
import type { PdfBlock, PageDimensions } from "../renderers/types.js";
import {
  measureHeight,
  layoutLines,
  shrinkWrapWidth,
  cssFontString,
} from "../typography/pretext-bridge.js";
import { loadFonts, buildFontStrings } from "../typography/fonts.js";
import { embedFonts, getMeasurementFontNames, type EmbeddedFonts } from "../typography/font-embedder.js";
import { highlightCode, hexToRgb, getThemeBackground } from "../typography/highlighter.js";
import { getConfig } from "../config-store.js";
import { traced, startSpan } from "../tracing.js";

export interface ExportParams {
  files: string[];
  output?: string;
  bundle?: boolean;
  renderer?: "auto" | "code" | "markdown" | "html" | "chat" | "structured";
  theme?: "light" | "dark";
  fontSize?: number;
  lineHeight?: number;
  pageSize?: "letter" | "a4" | "legal";
  lineNumbers?: boolean;
  toc?: boolean;
  dispositionTypography?: boolean;
}

export interface ExportResult {
  summary: string;
  outputPath: string;
  pages: number;
  bytes: number;
}

/** Rendering context threaded through all render functions */
interface RenderCtx {
  fonts: EmbeddedFonts;
  fontStrings: ReturnType<typeof buildFontStrings>;
  theme: typeof THEMES.light;
  themeName: "light" | "dark";
  fontSize: number;
  codeFontSize: number;
  lineHeightPx: number;       // fontSize * lineHeight multiplier
  codeLineHeightPx: number;
  contentWidth: number;
  lineNumbers: boolean;
}

const THEMES = {
  light: {
    background: rgb(1, 1, 1),
    text: rgb(0.1, 0.1, 0.1),
    heading: rgb(0.05, 0.05, 0.15),
    muted: rgb(0.45, 0.45, 0.5),
    codeBackground: rgb(0.96, 0.96, 0.97),
    codeBorder: rgb(0.85, 0.85, 0.88),
    rule: rgb(0.8, 0.8, 0.82),
    link: rgb(0.15, 0.35, 0.65),
    bubbleUser: rgb(0.92, 0.94, 1.0),
    bubbleAssistant: rgb(0.96, 0.96, 0.96),
    badge: rgb(0.2, 0.4, 0.7),
  },
  dark: {
    background: rgb(0.12, 0.12, 0.14),
    text: rgb(0.88, 0.88, 0.9),
    heading: rgb(0.92, 0.92, 0.95),
    muted: rgb(0.55, 0.55, 0.6),
    codeBackground: rgb(0.16, 0.16, 0.18),
    codeBorder: rgb(0.25, 0.25, 0.28),
    rule: rgb(0.25, 0.25, 0.28),
    link: rgb(0.4, 0.6, 0.9),
    bubbleUser: rgb(0.18, 0.22, 0.32),
    bubbleAssistant: rgb(0.18, 0.18, 0.2),
    badge: rgb(0.3, 0.5, 0.8),
  },
};

export async function exportToPdf(params: ExportParams): Promise<ExportResult> {
  return traced("tool.export", {
    "export.file_count": params.files.length,
    "export.bundle": params.bundle ?? false,
    "export.theme": params.theme ?? "light",
    "export.renderer": params.renderer ?? "auto",
  }, (span) => exportToPdfInner(params, span));
}

async function exportToPdfInner(params: ExportParams, toolSpan: ReturnType<typeof startSpan>): Promise<ExportResult> {
  const {
    files,
    bundle = false,
    renderer: rendererName = "auto",
    theme: themeName = "light",
    fontSize = 11,
    lineHeight: lineHeightMultiplier = 1.5,
    pageSize: pageSizeName = "letter",
    lineNumbers = false,
    toc = false,
  } = params;

  if (!files.length) throw new Error("No files specified for export");

  const resolvedFiles = files.map((f) => resolve(f));
  for (const file of resolvedFiles) {
    if (!existsSync(file)) throw new Error(`File not found: ${file}`);
  }

  // --- Font pipeline ---
  const fontStack = loadFonts();
  const config = getConfig();
  const codeFontSize = config.codeFontSize;
  const lineHeightPx = fontSize * lineHeightMultiplier;
  const codeLineHeightPx = codeFontSize * config.codeLineHeight;

  // --- PDF setup ---
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    bundle ? `Export — ${files.length} files` : basename(resolvedFiles[0], extname(resolvedFiles[0]))
  );
  pdf.setProducer("Pretext PDF by Dojo Genesis");
  pdf.setCreator("pretext-pdf MCP v0.2.0");
  pdf.setCreationDate(new Date());

  // Embed fonts into PDF (same files registered with canvas for Pretext)
  const embeddedFonts = await embedFonts(pdf, fontStack);
  const measureFontNames = getMeasurementFontNames(embeddedFonts.isCustom);
  const fontStrings = buildFontStrings(
    { body: { ...fontStack.body, family: measureFontNames.body }, code: { ...fontStack.code, family: measureFontNames.code }, codeMono: fontStack.codeMono, display: { ...fontStack.display, family: measureFontNames.display } },
    fontSize,
    codeFontSize,
    config.headingScale
  );

  const theme = THEMES[themeName];
  const pageSize = PAGE_SIZES[pageSizeName];
  const margins = { top: 72, right: 72, bottom: 72, left: 72 };
  const contentWidth = pageSize.width - margins.left - margins.right;
  const contentHeight = pageSize.height - margins.top - margins.bottom;

  const ctx: RenderCtx = {
    fonts: embeddedFonts,
    fontStrings,
    theme,
    themeName,
    fontSize,
    codeFontSize,
    lineHeightPx,
    codeLineHeightPx,
    contentWidth,
    lineNumbers,
  };

  // --- Parse all files ---
  const allBlocks: Array<{ filename: string; blocks: PdfBlock[] }> = [];
  for (const file of resolvedFiles) {
    const source = await readFile(file, "utf-8");
    const selectedRenderer = selectRenderer(file, source, rendererName);
    const blocks = await selectedRenderer.parse(source, file);
    allBlocks.push({ filename: file, blocks });
  }

  // --- Render to PDF ---
  let currentPageNum = 1;
  const tocEntries: Array<{ title: string; page: number; level: number }> = [];

  for (const { filename, blocks } of allBlocks) {
    if (bundle && allBlocks.length > 1) {
      tocEntries.push({ title: basename(filename), page: currentPageNum, level: 1 });
    }

    let page = addPage(pdf, pageSize, margins, theme);
    let y = pageSize.height - margins.top;

    for (const block of blocks) {
      const height = pretextMeasureHeight(block, ctx);

      if (y - height < margins.bottom) {
        addFooter(page, currentPageNum, ctx.fonts.body, pageSize, margins, theme);
        currentPageNum++;
        page = addPage(pdf, pageSize, margins, theme);
        y = pageSize.height - margins.top;
      }

      y = await renderBlock(page, block, y, margins.left, ctx);
    }

    addFooter(page, currentPageNum, ctx.fonts.body, pageSize, margins, theme);
    currentPageNum++;
  }

  // --- TOC ---
  if (toc && tocEntries.length > 1) {
    const tocPage = pdf.insertPage(0, [pageSize.width, pageSize.height]);
    let tocY = pageSize.height - margins.top;

    tocPage.drawText("Table of Contents", {
      x: margins.left, y: tocY, size: 18,
      font: ctx.fonts.displayBold, color: theme.heading,
    });
    tocY -= 36;

    for (const entry of tocEntries) {
      const indent = (entry.level - 1) * 20;
      // Offset page numbers by +1 because TOC page was inserted at index 0
      const displayPage = entry.page + 1;
      tocPage.drawText(`${entry.title}  ·····  ${displayPage}`, {
        x: margins.left + indent, y: tocY, size: 10,
        font: ctx.fonts.body, color: theme.text,
      });
      tocY -= 18;
    }
  }

  // --- Output ---
  const pdfBytes = await pdf.save();
  const outputPath = resolveOutputPath(params.output, resolvedFiles, bundle);
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, pdfBytes);

  const totalPages = toc && tocEntries.length > 1 ? currentPageNum : currentPageNum - 1;

  // Record final metrics on the tracing span
  toolSpan.setAttribute("export.pages", totalPages);
  toolSpan.setAttribute("export.bytes", pdfBytes.length);
  toolSpan.setAttribute("export.output_path", outputPath);
  toolSpan.setAttribute("font.custom", embeddedFonts.isCustom);

  return {
    summary: `Exported ${resolvedFiles.length} file(s) → ${outputPath} (${totalPages} pages, ${formatBytes(pdfBytes.length)})`,
    outputPath,
    pages: totalPages,
    bytes: pdfBytes.length,
  };
}

// --- Pretext-powered measurement ---

function pretextMeasureHeight(block: PdfBlock, ctx: RenderCtx): number {
  switch (block.type) {
    case "heading": {
      const level = (block.metadata?.level as number) ?? 2;
      const fontStr = ctx.fontStrings.heading(level);
      const scale = [2.0, 1.5, 1.25, 1.1, 1.0, 0.875][level - 1] ?? 1;
      const lh = ctx.fontSize * scale * 1.3;
      const { height } = measureHeight(block.content, fontStr, ctx.contentWidth, lh);
      return height + 12;
    }
    case "text": {
      if (block.metadata?.badge) return 24;
      if (block.metadata?.chatBubble) {
        const maxBubble = (block.metadata?.maxBubbleWidth as number) ?? ctx.contentWidth * 0.7;
        const { height } = measureHeight(block.content, ctx.fontStrings.body, maxBubble - 24, ctx.lineHeightPx);
        return height + 32; // padding + timestamp
      }
      const { height } = measureHeight(block.content, ctx.fontStrings.body, ctx.contentWidth, ctx.lineHeightPx);
      return height + 8;
    }
    case "code": {
      const codeLines = block.content.split("\n").length;
      return codeLines * ctx.codeLineHeightPx + 24; // code uses fixed line height + padding
    }
    case "rule":
      return 20;
    case "pagebreak":
      return Infinity;
    case "table": {
      const rows = ((block.metadata?.rows as string[][])?.length ?? 0) + 1;
      return rows * ctx.lineHeightPx + 16;
    }
    case "image":
      return (block.metadata?.height as number) ?? 200;
    default:
      return ctx.lineHeightPx;
  }
}

// --- Rendering ---

async function renderBlock(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): Promise<number> {
  switch (block.type) {
    case "heading":
      return renderHeading(page, block, y, x, ctx);
    case "text":
      if (block.metadata?.badge) return renderBadge(page, block, y, x, ctx);
      if (block.metadata?.chatBubble) return renderChatBubble(page, block, y, x, ctx);
      return renderText(page, block, y, x, ctx);
    case "code":
      return renderCode(page, block, y, x, ctx);
    case "rule":
      return renderRule(page, y, x, ctx);
    case "table":
      return renderTable(page, block, y, x, ctx);
    case "image":
      return renderImage(page, block, y, x, ctx);
    default:
      return y;
  }
}

function renderHeading(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): number {
  const level = (block.metadata?.level as number) ?? 2;
  const scale = [2.0, 1.5, 1.25, 1.1, 1.0, 0.875][level - 1] ?? 1;
  const headingSize = ctx.fontSize * scale;
  const headingLh = headingSize * 1.3;
  const font = level <= 2 ? ctx.fonts.displayBold : ctx.fonts.bodyBold;

  // Use Pretext for line layout
  const { lines } = layoutLines(block.content, ctx.fontStrings.heading(level), ctx.contentWidth, headingLh);

  for (const line of lines) {
    y -= headingLh;
    page.drawText(line.text, {
      x, y, size: headingSize, font, color: ctx.theme.heading, maxWidth: ctx.contentWidth,
    });
  }
  y -= 4;
  return y;
}

function renderText(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): number {
  const textColor = block.metadata?.muted ? ctx.theme.muted : ctx.theme.text;
  const isBlockquote = !!block.metadata?.blockquote;
  const isListItem = !!block.metadata?.listItem;
  const indent = isBlockquote ? 20 : (block.metadata?.indent as number ?? 0);
  const effectiveWidth = ctx.contentWidth - indent;

  const { lines } = layoutLines(block.content, ctx.fontStrings.body, effectiveWidth, ctx.lineHeightPx);

  for (const line of lines) {
    y -= ctx.lineHeightPx;
    if (isBlockquote) {
      page.drawRectangle({
        x: x + 4, y: y - 2, width: 3, height: ctx.lineHeightPx, color: ctx.theme.rule,
      });
    }
    page.drawText(line.text, {
      x: x + indent, y, size: ctx.fontSize, font: ctx.fonts.body,
      color: textColor, maxWidth: effectiveWidth,
    });
  }
  // Tighter spacing for consecutive list items, normal spacing otherwise
  y -= isListItem ? 2 : 6;
  return y;
}

function renderBadge(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): number {
  const badgeWidth = ctx.fonts.bodyBold.widthOfTextAtSize(block.content, 7) + 12;
  y -= 16;
  page.drawRectangle({ x, y: y - 2, width: badgeWidth, height: 14, color: ctx.theme.badge });
  page.drawText(block.content, {
    x: x + 6, y: y + 1, size: 7, font: ctx.fonts.bodyBold, color: rgb(1, 1, 1),
  });
  y -= 8;
  return y;
}

function renderChatBubble(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): number {
  const role = block.metadata?.role as string;
  const isUser = role === "user";
  const maxBubbleWidth = (block.metadata?.maxBubbleWidth as number) ?? ctx.contentWidth * 0.7;
  const bubbleColor = isUser ? ctx.theme.bubbleUser : ctx.theme.bubbleAssistant;
  const padding = 12;
  const innerWidth = maxBubbleWidth - padding * 2;

  // Use Pretext for shrink-wrap measurement and line layout
  const { maxLineWidth, lineCount } = shrinkWrapWidth(block.content, ctx.fontStrings.body, innerWidth);
  const { lines } = layoutLines(block.content, ctx.fontStrings.body, innerWidth, ctx.lineHeightPx);

  const bubbleWidth = Math.min(maxLineWidth + padding * 2 + 4, maxBubbleWidth);
  const bubbleHeight = lineCount * ctx.lineHeightPx + padding * 2;

  y -= bubbleHeight + 8;
  const bubbleX = isUser ? x + ctx.contentWidth - bubbleWidth : x;

  page.drawRectangle({ x: bubbleX, y, width: bubbleWidth, height: bubbleHeight, color: bubbleColor });

  let textY = y + bubbleHeight - padding - ctx.fontSize;
  for (const line of lines) {
    page.drawText(line.text, {
      x: bubbleX + padding, y: textY, size: ctx.fontSize, font: ctx.fonts.body, color: ctx.theme.text,
    });
    textY -= ctx.lineHeightPx;
  }

  if (block.metadata?.timestamp) {
    const ts = new Date(block.metadata.timestamp as string).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const tsWidth = ctx.fonts.body.widthOfTextAtSize(ts, 7);
    page.drawText(ts, {
      x: isUser ? bubbleX + bubbleWidth - tsWidth - 4 : bubbleX + 4,
      y: y - 10, size: 7, font: ctx.fonts.body, color: ctx.theme.muted,
    });
    y -= 12;
  }

  return y;
}

async function renderCode(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): Promise<number> {
  const codeSize = ctx.codeFontSize;
  const codeLh = ctx.codeLineHeightPx;
  const padding = 8;
  const lang = (block.metadata?.lang as string) ?? "text";
  const sourceLines = block.content.split("\n");
  const lineNumWidth = ctx.lineNumbers
    ? ctx.fonts.code.widthOfTextAtSize(`${sourceLines.length} `, codeSize) + 8
    : 0;
  const blockHeight = sourceLines.length * codeLh + padding * 2;

  // Syntax highlight via Shiki
  const highlighted = await highlightCode(block.content, lang, ctx.themeName);

  // Theme-aware background
  const bgHex = getThemeBackground(ctx.themeName);
  const bgRgb = hexToRgb(bgHex);

  y -= 6;
  page.drawRectangle({
    x: x - 4, y: y - blockHeight, width: ctx.contentWidth + 8, height: blockHeight,
    color: rgb(bgRgb.r, bgRgb.g, bgRgb.b),
    borderColor: ctx.theme.codeBorder, borderWidth: 0.5,
  });

  y -= padding;
  for (let i = 0; i < highlighted.length; i++) {
    y -= codeLh;

    if (ctx.lineNumbers) {
      page.drawText(`${i + 1}`, {
        x: x + 2, y, size: codeSize, font: ctx.fonts.code, color: ctx.theme.muted,
      });
    }

    // Draw each token with its Shiki-assigned color
    let tokenX = x + lineNumWidth + 4;
    for (const token of highlighted[i].tokens) {
      if (!token.text) continue;
      const tokenRgb = hexToRgb(token.color);
      page.drawText(token.text, {
        x: tokenX, y, size: codeSize, font: ctx.fonts.code,
        color: rgb(tokenRgb.r, tokenRgb.g, tokenRgb.b),
      });
      tokenX += ctx.fonts.code.widthOfTextAtSize(token.text, codeSize);
    }
  }

  y -= padding + 6;
  return y;
}

async function renderImage(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): Promise<number> {
  const src = block.metadata?.src as string | undefined;
  if (!src || !existsSync(src)) {
    y -= 20;
    page.drawText(`[Image: ${src ?? "missing"}]`, {
      x, y, size: ctx.fontSize - 2, font: ctx.fonts.body, color: ctx.theme.muted,
    });
    return y - 8;
  }

  try {
    const imgBytes = await readFile(src);
    const ext = extname(src).toLowerCase();
    const img = ext === ".png"
      ? await page.doc.embedPng(imgBytes)
      : await page.doc.embedJpg(imgBytes);

    const maxW = (block.metadata?.width as number) ?? ctx.contentWidth;
    const maxH = (block.metadata?.height as number) ?? 400;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;

    y -= h + 8;
    page.drawImage(img, { x, y, width: w, height: h });
    return y - 8;
  } catch {
    y -= 20;
    page.drawText(`[Image error: ${src}]`, {
      x, y, size: ctx.fontSize - 2, font: ctx.fonts.body, color: ctx.theme.muted,
    });
    return y - 8;
  }
}

function renderRule(page: PDFPage, y: number, x: number, ctx: RenderCtx): number {
  y -= 10;
  page.drawLine({
    start: { x, y }, end: { x: x + ctx.contentWidth, y },
    thickness: 0.5, color: ctx.theme.rule,
  });
  y -= 10;
  return y;
}

function renderTable(page: PDFPage, block: PdfBlock, y: number, x: number, ctx: RenderCtx): number {
  const header = (block.metadata?.header as string[]) ?? [];
  const rows = (block.metadata?.rows as string[][]) ?? [];
  const colCount = header.length || (rows[0]?.length ?? 1);
  const colWidth = ctx.contentWidth / colCount;
  const cellPadding = 4;
  const cellFontSize = ctx.fontSize - 1;
  const cellLh = cellFontSize * 1.35;
  // Build a CSS font string for table cell measurement
  const cellFontStr = cssFontString(ctx.fonts.body.name || "Inter", cellFontSize);

  // Helper: measure row height using Pretext, accounting for multi-line cells
  function measureRowHeight(cells: string[]): number {
    let maxLines = 1;
    for (const cell of cells) {
      const { height } = measureHeight(cell, cellFontStr, colWidth - cellPadding * 2, cellLh);
      const lines = Math.max(1, Math.ceil(height / cellLh));
      if (lines > maxLines) maxLines = lines;
    }
    return maxLines * cellLh + cellPadding * 2;
  }

  // Helper: render a single row (header or data)
  function drawRow(cells: string[], rowY: number, rowH: number, font: PDFFont, textColor: ReturnType<typeof rgb>, bgColor?: ReturnType<typeof rgb>): number {
    if (bgColor) {
      page.drawRectangle({
        x: x - 2, y: rowY - rowH, width: ctx.contentWidth + 4, height: rowH, color: bgColor,
      });
    }
    for (let col = 0; col < cells.length; col++) {
      const cellW = colWidth - cellPadding * 2;
      const { lines } = layoutLines(cells[col], cellFontStr, cellW, cellLh);
      let lineY = rowY - cellPadding - cellFontSize;
      for (const line of lines) {
        page.drawText(line.text, {
          x: x + col * colWidth + cellPadding, y: lineY, size: cellFontSize,
          font, color: textColor, maxWidth: cellW,
        });
        lineY -= cellLh;
      }
    }
    return rowY - rowH;
  }

  // Render header
  const headerHeight = measureRowHeight(header);
  y = drawRow(header, y, headerHeight, ctx.fonts.bodyBold, ctx.theme.heading, ctx.theme.codeBackground);

  // Render data rows with alternating subtle background
  for (let i = 0; i < rows.length; i++) {
    const rowH = measureRowHeight(rows[i]);
    const bg = i % 2 === 1 ? ctx.theme.codeBackground : undefined;
    y = drawRow(rows[i], y, rowH, ctx.fonts.body, ctx.theme.text, bg);
  }

  y -= 8;
  return y;
}

// --- Helpers ---

function addPage(
  pdf: PDFDocument,
  pageSize: { width: number; height: number },
  margins: { top: number; right: number; bottom: number; left: number },
  theme: typeof THEMES.light
): PDFPage {
  const page = pdf.addPage([pageSize.width, pageSize.height]);
  if (theme === THEMES.dark) {
    page.drawRectangle({ x: 0, y: 0, width: pageSize.width, height: pageSize.height, color: theme.background });
  }
  return page;
}

function addFooter(
  page: PDFPage, pageNumber: number, font: PDFFont,
  pageSize: { width: number; height: number },
  margins: { top: number; right: number; bottom: number; left: number },
  theme: typeof THEMES.light
): void {
  const text = `${pageNumber}`;
  const width = font.widthOfTextAtSize(text, 8);
  page.drawText(text, {
    x: pageSize.width / 2 - width / 2, y: margins.bottom / 2,
    size: 8, font, color: theme.muted,
  });
}

function resolveOutputPath(explicit: string | undefined, inputFiles: string[], bundle: boolean): string {
  if (explicit) return resolve(explicit);
  const cwd = process.cwd();
  const exportsDir = join(cwd, "exports");
  if (bundle) return join(exportsDir, `export-${Date.now()}.pdf`);
  const inputBase = basename(inputFiles[0], extname(inputFiles[0]));
  return join(exportsDir, `${inputBase}.pdf`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
