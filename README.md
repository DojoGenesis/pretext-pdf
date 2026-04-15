# @dojogenesis/pretext-pdf-mcp

MCP server for Pretext-powered PDF export with precise Canvas-based typography.

Converts code, markdown, HTML, chat conversations, and structured documents to professionally typeset PDFs. Built on [@chenglou/pretext](https://github.com/chenglou/pretext) for DOM-free text measurement (0.0003ms per layout), ships 4 bundled variable fonts, and integrates with any MCP-compatible AI assistant.

## Features

- 6 content-aware renderers (code, markdown, HTML, chat, structured, auto-detect)
- 40+ language syntax highlighting via Shiki
- 4 bundled variable fonts (Inter, Recursive, Fraunces)
- Light and dark themes
- Multi-file bundling with auto-generated table of contents
- Session-persistent typography configuration
- OTEL-compatible tracing
- Zero browser dependency (no Puppeteer/Playwright/chromedp)

## Quick Start

### As an MCP Server

Add to your `.mcp.json`:

```json
{
  "pretext-pdf": {
    "command": "npx",
    "args": ["@dojogenesis/pretext-pdf-mcp"]
  }
}
```

### Docker

```bash
docker pull ghcr.io/dojogenesis/pretext-pdf-mcp:latest
docker run -i ghcr.io/dojogenesis/pretext-pdf-mcp
```

## Tools

### `export`

Export one or more files to PDF.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| files | string[] | required | Absolute file paths |
| output | string | ./exports/\<name\>.pdf | Output path |
| bundle | boolean | false | Combine files into one PDF |
| renderer | enum | auto | auto, code, markdown, html, chat, structured |
| theme | enum | light | light, dark |
| fontSize | number | 11 | Body font size (6-24pt) |
| lineHeight | number | 1.5 | Line height multiplier (1.0-3.0) |
| pageSize | enum | letter | letter, a4, legal |
| lineNumbers | boolean | false | Show line numbers (code) |
| toc | boolean | false | Generate table of contents |

### `configure-typography`

Session-persistent typography settings.

| Parameter | Type | Options |
|-----------|------|---------|
| fontFamily | enum | inter, recursive, fraunces |
| codeFontFamily | enum | recursive-mono, recursive-casual |
| fontSize | number | 6-24 |
| lineHeight | number | 1.0-3.0 |

## Renderers

| Renderer | Triggers | Highlights |
|----------|----------|------------|
| code | 40+ file extensions | Shiki syntax highlighting, token-level colors |
| markdown | .md, .mdx | Headings, tables, code fences, frontmatter |
| html | .html, .htm | HTML source rendering |
| chat | .chat.json | Bubble layout, disposition-to-typography mapping |
| structured | SKILL.md, ADR-\*, STATUS.md | Color badges, section numbering, checklists |
| auto | (default) | Priority: structured > chat > extension > code fallback |

## Fonts

All fonts are bundled as variable TTFs — no network requests at runtime:

- **Inter** — body text (optical sizing, weight 100-900)
- **Recursive** — code (mono/casual axis, weight)
- **Fraunces** — display/headings (softness, wonkiness, optical sizing)

The same TTF files are used for both measurement (node-canvas) and PDF embedding (pdf-lib + fontkit), guaranteeing zero measurement drift between layout and output.

## Development

```bash
git clone https://github.com/DojoGenesis/pretext-pdf.git
cd pretext-pdf
npm install
npm run dev      # Start with tsx
npm test         # Run smoke tests (7 suites)
npm run build    # Compile to dist/
```

## License

Apache-2.0
