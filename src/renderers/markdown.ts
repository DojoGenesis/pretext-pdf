/**
 * Markdown Renderer — Parses Markdown into PdfBlocks.
 *
 * Uses `marked` for parsing, extracts structure into blocks
 * that the PDF generator can lay out with Pretext typography.
 */

import { marked, type Token, type Tokens } from "marked";
import type { PdfBlock, Renderer } from "./types.js";

/**
 * Strip inline markdown formatting from text.
 * Handles: **bold**, *italic*, __bold__, _italic_, `code`,
 * [links](url), ~~strikethrough~~, and nested combinations.
 */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // [link text](url) → link text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")   // ![alt](url) → alt
    .replace(/\*\*(.+?)\*\*/g, "$1")            // **bold** → bold
    .replace(/__(.+?)__/g, "$1")                 // __bold__ → bold
    .replace(/\*(.+?)\*/g, "$1")                 // *italic* → italic
    .replace(/_(.+?)_/g, "$1")                   // _italic_ → italic
    .replace(/~~(.+?)~~/g, "$1")                 // ~~strike~~ → strike
    .replace(/`([^`]+)`/g, "$1");                // `code` → code
}

function extractFrontmatter(source: string): {
  frontmatter: Record<string, string> | null;
  body: string;
} {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: source };

  const pairs: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      pairs[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
    }
  }
  return { frontmatter: pairs, body: match[2] };
}

function tokensToBlocks(tokens: Token[]): PdfBlock[] {
  const blocks: PdfBlock[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const t = token as Tokens.Heading;
        blocks.push({
          type: "heading",
          content: stripInlineMarkup(t.text),
          metadata: { level: t.depth },
        });
        break;
      }

      case "paragraph": {
        const t = token as Tokens.Paragraph;
        blocks.push({ type: "text", content: stripInlineMarkup(t.text) });
        break;
      }

      case "code": {
        const t = token as Tokens.Code;
        blocks.push({
          type: "code",
          content: t.text,
          metadata: { lang: t.lang ?? "text" },
        });
        break;
      }

      case "hr": {
        blocks.push({ type: "rule", content: "" });
        break;
      }

      case "table": {
        const t = token as Tokens.Table;
        const header = t.header.map((cell) => cell.text);
        const rows = t.rows.map((row) => row.map((cell) => cell.text));
        blocks.push({
          type: "table",
          content: "",
          metadata: { header, rows },
        });
        break;
      }

      case "list": {
        const t = token as Tokens.List;
        // Emit each list item as a separate block so Pretext lays out each independently.
        // Previously items were joined with \n into one text block, but Pretext treats
        // \n as soft breaks (like CSS white-space: normal), collapsing them into one line.
        for (let i = 0; i < t.items.length; i++) {
          const raw = stripInlineMarkup(t.items[i].text);
          const prefix = t.ordered ? `${i + 1}. ` : "\u2022 ";  // bullet character
          blocks.push({
            type: "text",
            content: prefix + raw,
            metadata: { listItem: true, listType: t.ordered ? "ol" : "ul", indent: 16 },
          });
        }
        break;
      }

      case "blockquote": {
        const t = token as Tokens.Blockquote;
        const inner = tokensToBlocks(t.tokens);
        for (const block of inner) {
          blocks.push({
            ...block,
            metadata: { ...block.metadata, blockquote: true },
          });
        }
        break;
      }

      case "space":
        // Skip whitespace tokens
        break;

      default:
        // Catch-all: render as text
        if ("text" in token) {
          blocks.push({
            type: "text",
            content: (token as any).text ?? "",
          });
        }
    }
  }

  return blocks;
}

export const markdownRenderer: Renderer = {
  name: "markdown",
  extensions: [".md", ".markdown", ".mdx"],

  async parse(source: string, filename: string): Promise<PdfBlock[]> {
    const { frontmatter, body } = extractFrontmatter(source);
    const blocks: PdfBlock[] = [];

    // Add frontmatter as metadata header if present
    if (frontmatter) {
      const name = frontmatter.name ?? frontmatter.title;
      if (name) {
        blocks.push({
          type: "heading",
          content: name,
          metadata: { level: 1, fromFrontmatter: true },
        });
      }
      if (frontmatter.description) {
        blocks.push({
          type: "text",
          content: frontmatter.description,
          metadata: { subtitle: true },
        });
      }
    }

    // Parse markdown body
    const tokens = marked.lexer(body);
    blocks.push(...tokensToBlocks(tokens));

    return blocks;
  },
};
