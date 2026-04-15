#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { exportToPdf } from "./tools/export-pdf.js";
import { getConfig, setConfig } from "./config-store.js";

const server = new McpServer({
  name: "pretext-pdf",
  version: "0.2.0",
});

server.tool(
  "export",
  "Export one or more files to a Pretext-typeset PDF. Supports code (syntax-highlighted), Markdown, HTML, chat conversations, and structured Dojo files.",
  {
    files: z.array(z.string()).describe("Absolute file paths to export"),
    output: z.string().optional().describe("Output PDF path. Defaults to ./exports/<filename>.pdf"),
    bundle: z.boolean().optional().default(false).describe("Combine multiple files into a single PDF"),
    renderer: z.enum(["auto", "code", "markdown", "html", "chat", "structured"]).optional().default("auto"),
    theme: z.enum(["light", "dark"]).optional().default("light"),
    fontSize: z.number().min(6).max(24).optional(),
    lineHeight: z.number().min(1.0).max(3.0).optional(),
    pageSize: z.enum(["letter", "a4", "legal"]).optional().default("letter"),
    lineNumbers: z.boolean().optional().default(false),
    toc: z.boolean().optional().default(false),
    dispositionTypography: z.boolean().optional().default(false),
  },
  async (params) => {
    try {
      const config = getConfig();
      const result = await exportToPdf({
        ...params,
        fontSize: params.fontSize ?? config.fontSize,
        lineHeight: params.lineHeight ?? config.lineHeight,
      });
      return { content: [{ type: "text" as const, text: result.summary }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { content: [{ type: "text" as const, text: `PDF export failed: ${message}` }], isError: true };
    }
  }
);

server.tool(
  "configure-typography",
  "Get or set typography configuration for PDF export. Settings persist for this session.",
  {
    fontFamily: z.enum(["inter", "recursive", "fraunces"]).optional(),
    codeFontFamily: z.enum(["recursive-mono", "recursive-casual"]).optional(),
    fontSize: z.number().min(6).max(24).optional(),
    lineHeight: z.number().min(1.0).max(3.0).optional(),
  },
  async (params) => {
    const overrides: Record<string, unknown> = {};
    if (params.fontFamily) overrides.fontFamily = params.fontFamily;
    if (params.codeFontFamily) overrides.codeFontFamily = params.codeFontFamily;
    if (params.fontSize) overrides.fontSize = params.fontSize;
    if (params.lineHeight) overrides.lineHeight = params.lineHeight;

    const config = Object.keys(overrides).length > 0
      ? setConfig(overrides as any)
      : getConfig();

    return { content: [{ type: "text" as const, text: JSON.stringify(config, null, 2) }] };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
