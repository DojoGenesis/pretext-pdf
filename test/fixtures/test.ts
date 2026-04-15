/**
 * Sample TypeScript file for code renderer testing.
 */

interface Config {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
}

function createConfig(overrides?: Partial<Config>): Config {
  const defaults: Config = {
    fontSize: 11,
    lineHeight: 1.5,
    fontFamily: "Inter",
  };
  return { ...defaults, ...overrides };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
