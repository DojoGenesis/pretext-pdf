/**
 * Smoke tests for pretext-pdf microservice.
 * Exercises the full pipeline: file → renderer → Pretext measurement → PDF.
 *
 * Run: npx tsx test/smoke.test.ts
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, unlinkSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { exportToPdf } from "../src/tools/export-pdf.js";

const FIXTURES_DIR = join(import.meta.dirname, "fixtures");
const OUTPUT_DIR = join(import.meta.dirname, "output");

// Ensure directories exist
if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// --- Fixtures ---

const MARKDOWN_FIXTURE = join(FIXTURES_DIR, "test.md");
writeFileSync(MARKDOWN_FIXTURE, `---
name: test-document
description: A test document for smoke testing
---

# Heading One

This is a paragraph with some text. It should be wrapped properly using Pretext's
Canvas-based typography measurement engine. The line breaks should be computed from
actual font metrics, not crude character-count heuristics.

## Code Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

## A Table

| Feature | Status |
|---------|--------|
| Markdown | Working |
| Code | Working |
| Tables | Working |

---

> This is a blockquote. It should be indented with a left border.

- Item one
- Item two
- Item three
`);

const CODE_FIXTURE = join(FIXTURES_DIR, "test.ts");
writeFileSync(CODE_FIXTURE, `/**
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
  if (bytes < 1024) return \`\${bytes}B\`;
  if (bytes < 1024 * 1024) return \`\${(bytes / 1024).toFixed(1)}KB\`;
  return \`\${(bytes / (1024 * 1024)).toFixed(1)}MB\`;
}
`);

const HTML_FIXTURE = join(FIXTURES_DIR, "test.html");
writeFileSync(HTML_FIXTURE, `<!DOCTYPE html>
<html>
<head><title>Test HTML Document</title></head>
<body>
  <h1>Main Heading</h1>
  <p>This is a paragraph in an HTML document. It should be extracted and rendered properly.</p>
  <h2>Subheading</h2>
  <p>Another paragraph with <strong>bold</strong> and <em>italic</em> text.</p>
  <pre><code class="language-javascript">console.log("Hello from HTML!");</code></pre>
  <p>Entities: &amp; &lt; &gt; &quot; &#39; &#x2014; &#160;</p>
</body>
</html>
`);

const CHAT_FIXTURE = join(FIXTURES_DIR, "test.chat.json");
writeFileSync(CHAT_FIXTURE, JSON.stringify({
  messages: [
    { role: "user", content: "How does Pretext handle text measurement?", timestamp: "2026-04-08T10:00:00Z" },
    { role: "assistant", content: "Pretext uses a two-phase approach: prepare() segments the text and measures each segment via Canvas, caching widths. Then layout() walks the cached widths with pure arithmetic to count lines and compute height. This is ~0.0002ms per text block.", timestamp: "2026-04-08T10:00:05Z" },
    { role: "user", content: "What about variable fonts?", timestamp: "2026-04-08T10:01:00Z" },
    { role: "assistant", content: "Variable fonts work through CSS font strings passed to prepare(). For example, '700 16px Fraunces' will measure using weight 700 of the Fraunces variable font. The Canvas API resolves variation axes automatically.", timestamp: "2026-04-08T10:01:08Z", disposition: { tone: "technical", verbosity: "verbose", depth: "deep", brevity: "expansive" } },
  ],
  metadata: { title: "Pretext Typography Discussion", created: "2026-04-08T10:00:00Z", participants: ["User", "Assistant"] },
}, null, 2));

const SKILL_FIXTURE = join(FIXTURES_DIR, "test-skill.md");
writeFileSync(SKILL_FIXTURE, `---
name: test-skill
description: A test skill for structured renderer testing
---

# Test Skill

**Version:** 1.0
**Created:** 2026-04-08

## I. Philosophy

Every test should be meaningful.

## II. When to Use

Use this when testing structured file rendering.

## III. Steps

1. Create fixture
2. Run export
3. Verify output

## IV. Reflection Questions

- Does the PDF preserve section numbering?
- Are frontmatter fields rendered as metadata?
`);

// --- Tests ---

describe("Markdown export", () => {
  const output = join(OUTPUT_DIR, "test-markdown.pdf");

  test("exports Markdown to PDF with Pretext measurement", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [MARKDOWN_FIXTURE],
      output,
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.bytes > 0, "PDF should have content");
    assert.ok(result.pages >= 1, "Should have at least 1 page");
    assert.ok(result.summary.includes("test-markdown.pdf"), "Summary should mention output file");

    const pdfBytes = readFileSync(output);
    const header = pdfBytes.subarray(0, 5).toString("ascii");
    assert.equal(header, "%PDF-", "File should start with PDF magic bytes");

    console.log(`  Markdown: ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("Code export", () => {
  const output = join(OUTPUT_DIR, "test-code.pdf");

  test("exports TypeScript to PDF with line numbers", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [CODE_FIXTURE],
      output,
      lineNumbers: true,
      theme: "dark",
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.bytes > 0, "PDF should have content");

    console.log(`  Code (dark+lineNumbers): ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("HTML export", () => {
  const output = join(OUTPUT_DIR, "test-html.pdf");

  test("exports HTML to PDF with entity decoding", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [HTML_FIXTURE],
      output,
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.bytes > 0, "PDF should have content");

    console.log(`  HTML: ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("Chat export", () => {
  const output = join(OUTPUT_DIR, "test-chat.pdf");

  test("exports chat conversation to PDF with bubble layout", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [CHAT_FIXTURE],
      output,
      renderer: "chat",
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.bytes > 0, "PDF should have content");

    console.log(`  Chat: ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("Structured (SKILL.md) export", () => {
  const output = join(OUTPUT_DIR, "test-structured.pdf");

  test("exports SKILL.md with section detection and badge", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [SKILL_FIXTURE],
      output,
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.bytes > 0, "PDF should have content");

    console.log(`  Structured: ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("Bundle export with TOC", () => {
  const output = join(OUTPUT_DIR, "test-bundle.pdf");

  test("bundles multiple files with table of contents", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [MARKDOWN_FIXTURE, CODE_FIXTURE, SKILL_FIXTURE],
      output,
      bundle: true,
      toc: true,
    });

    assert.ok(existsSync(output), "PDF file should be created");
    assert.ok(result.pages >= 3, "Bundle should have at least 3 pages (TOC + content)");

    console.log(`  Bundle+TOC: ${result.pages} pages, ${formatBytes(result.bytes)}`);
  });
});

describe("Font embedding", () => {
  const output = join(OUTPUT_DIR, "test-fonts.pdf");

  test("embeds custom fonts when available", async () => {
    if (existsSync(output)) unlinkSync(output);

    const result = await exportToPdf({
      files: [MARKDOWN_FIXTURE],
      output,
    });

    // Verify by re-loading the PDF and checking font resource names
    const { PDFDocument } = await import("pdf-lib");
    const pdfBytes = readFileSync(output);
    const pdf = await PDFDocument.load(pdfBytes);
    const page = pdf.getPages()[0];
    const resources = page.node.get(page.node.context.obj("Resources"));
    const resourceStr = resources?.toString() ?? "";
    const hasInterFont = resourceStr.includes("InterVariable") || resourceStr.includes("Inter");
    const hasFrauncesFont = resourceStr.includes("Fraunces");

    assert.ok(hasInterFont || hasFrauncesFont, "PDF should embed custom variable fonts (Inter or Fraunces)");
    console.log(`  Font embedding: Inter=${hasInterFont}, Fraunces=${hasFrauncesFont}, ${formatBytes(result.bytes)}`);
  });
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
