/**
 * In-process typography configuration store.
 * Persists for the lifetime of the MCP server process (one Claude session).
 */

export interface TypographyConfig {
  fontFamily: string;
  codeFontFamily: string;
  fontSize: number;
  codeFontSize: number;
  lineHeight: number;
  codeLineHeight: number;
  headingScale: number[];
  maxWidth: number;
}

const DEFAULT_CONFIG: TypographyConfig = {
  fontFamily: "inter",
  codeFontFamily: "recursive-mono",
  fontSize: 11,
  codeFontSize: 9.5,
  lineHeight: 1.5,
  codeLineHeight: 1.35,
  headingScale: [2.0, 1.5, 1.25, 1.1, 1.0, 0.875],
  maxWidth: 468,
};

let current: TypographyConfig = { ...DEFAULT_CONFIG };

export function getConfig(): TypographyConfig {
  return { ...current };
}

export function setConfig(overrides: Partial<TypographyConfig>): TypographyConfig {
  current = { ...current, ...overrides };
  return { ...current };
}

export function resetConfig(): TypographyConfig {
  current = { ...DEFAULT_CONFIG };
  return { ...current };
}

export { DEFAULT_CONFIG };
