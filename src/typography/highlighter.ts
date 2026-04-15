/**
 * Shiki-powered syntax highlighting for PDF code blocks.
 *
 * Returns tokenized lines with color information that renderCode()
 * uses to draw colored spans instead of plain monochrome text.
 */

import { createHighlighter, type Highlighter, type ThemedToken } from "shiki";

export interface HighlightedLine {
  tokens: Array<{
    text: string;
    color: string; // hex color, e.g. "#D4D4D4"
  }>;
}

let highlighterInstance: Highlighter | null = null;

const LIGHT_THEME = "github-light";
const DARK_THEME = "github-dark";

/**
 * Lazy-init the Shiki highlighter. First call loads grammars (~200ms),
 * subsequent calls reuse the instance.
 */
async function getHighlighter(): Promise<Highlighter> {
  if (highlighterInstance) return highlighterInstance;

  highlighterInstance = await createHighlighter({
    themes: [LIGHT_THEME, DARK_THEME],
    langs: [
      "typescript", "tsx", "javascript", "jsx",
      "go", "python", "rust", "ruby", "java", "kotlin", "swift",
      "c", "cpp", "csharp", "php",
      "bash", "fish", "sql",
      "html", "css", "scss", "less",
      "json", "yaml", "toml", "xml",
      "graphql", "dockerfile", "lua", "zig",
      "markdown", "elixir", "haskell", "ocaml", "clojure",
    ],
  });

  return highlighterInstance;
}

/**
 * Tokenize source code into colored spans per line.
 *
 * @param code - Source code string
 * @param lang - Shiki language identifier (e.g. "typescript")
 * @param theme - "light" or "dark"
 * @returns Array of lines, each containing colored tokens
 */
export async function highlightCode(
  code: string,
  lang: string,
  theme: "light" | "dark"
): Promise<HighlightedLine[]> {
  const shikiTheme = theme === "dark" ? DARK_THEME : LIGHT_THEME;

  try {
    const highlighter = await getHighlighter();

    // Check if lang is supported, fall back to plaintext
    const loadedLangs = highlighter.getLoadedLanguages();
    const effectiveLang = loadedLangs.includes(lang as any) ? lang : "text";

    const result = highlighter.codeToTokens(code, {
      lang: effectiveLang as any,
      theme: shikiTheme,
    });

    return result.tokens.map((lineTokens: ThemedToken[]) => ({
      tokens: lineTokens.map((token) => ({
        text: token.content,
        color: token.color ?? (theme === "dark" ? "#D4D4D4" : "#24292E"),
      })),
    }));
  } catch {
    // Fallback: return unhighlighted lines
    const defaultColor = theme === "dark" ? "#D4D4D4" : "#24292E";
    return code.split("\n").map((line) => ({
      tokens: [{ text: line, color: defaultColor }],
    }));
  }
}

/**
 * Parse a hex color string to pdf-lib rgb() values [0-1].
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * Get the theme background color.
 */
export function getThemeBackground(theme: "light" | "dark"): string {
  return theme === "dark" ? "#24292E" : "#F6F8FA";
}
