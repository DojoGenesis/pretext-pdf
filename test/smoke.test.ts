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
import { chatRenderer } from "../src/renderers/chat.js";
import { markdownRenderer } from "../src/renderers/markdown.js";
import { structuredRenderer, isStructuredFile } from "../src/renderers/structured.js";
import { htmlRenderer } from "../src/renderers/html.js";
import { codeRenderer } from "../src/renderers/code.js";
import { selectRenderer } from "../src/renderers/index.js";

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

// ---------------------------------------------------------------------------
// Chat renderer — pure parse unit tests
// These call chatRenderer.parse directly without touching the PDF pipeline.
// ---------------------------------------------------------------------------

describe("Chat renderer — pure parse", () => {
  // -------------------------------------------------------------------------
  // 1. Standard ChatExport format
  // -------------------------------------------------------------------------
  test("standard format: produces heading, date, participants, rule, then message blocks", async () => {
    const source = JSON.stringify({
      messages: [
        { role: "user", content: "Hello!", timestamp: "2026-04-08T10:00:00Z" },
        { role: "assistant", content: "Hi there.", timestamp: "2026-04-08T10:00:05Z" },
      ],
      metadata: {
        title: "Test Chat",
        created: "2026-04-08T10:00:00Z",
        participants: ["Alice", "Bot"],
      },
    });

    const blocks = await chatRenderer.parse(source, "test.chat.json");

    // Minimum 5 blocks: heading + date + participants + rule + 2 messages
    assert.ok(blocks.length >= 6, `Expected at least 6 blocks, got ${blocks.length}`);

    // Block 0: heading from metadata.title
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "Test Chat");
    assert.equal((blocks[0].metadata as Record<string, unknown>).level, 1);

    // Block 1: date text block from metadata.created
    assert.equal(blocks[1].type, "text");
    // The content is a locale-formatted date string — just verify it contains "2026"
    assert.ok(blocks[1].content.includes("2026"), `Date block should contain "2026", got: "${blocks[1].content}"`);
    assert.equal((blocks[1].metadata as Record<string, unknown>).subtitle, true);
    assert.equal((blocks[1].metadata as Record<string, unknown>).muted, true);

    // Block 2: participants text block
    assert.equal(blocks[2].type, "text");
    assert.ok(blocks[2].content.includes("Alice"), `Participants block should include "Alice"`);
    assert.ok(blocks[2].content.includes("Bot"), `Participants block should include "Bot"`);
    assert.equal((blocks[2].metadata as Record<string, unknown>).muted, true);

    // Block 3: rule
    assert.equal(blocks[3].type, "rule");

    // Block 4: user message bubble
    const userBlock = blocks[4];
    assert.equal(userBlock.type, "text");
    assert.equal(userBlock.content, "Hello!");
    const userMeta = userBlock.metadata as Record<string, unknown>;
    assert.equal(userMeta.chatBubble, true);
    assert.equal(userMeta.role, "user");
    assert.equal(userMeta.alignment, "right");

    // Block 5: assistant message bubble
    const asstBlock = blocks[5];
    assert.equal(asstBlock.type, "text");
    assert.equal(asstBlock.content, "Hi there.");
    const asstMeta = asstBlock.metadata as Record<string, unknown>;
    assert.equal(asstMeta.chatBubble, true);
    assert.equal(asstMeta.role, "assistant");
    assert.equal(asstMeta.alignment, "left");
  });

  // -------------------------------------------------------------------------
  // 2. DojoChat native format
  // -------------------------------------------------------------------------
  test("DojoChat native format: normalizes to ChatExport, uses preset as second participant", async () => {
    const source = JSON.stringify({
      id: "conv-abc123",
      title: "Dojo Session",
      preset: "ADA",
      created_at: "2026-05-01T09:00:00Z",
      updated_at: "2026-05-01T09:10:00Z",
      messages: [
        {
          id: "msg-1",
          conversation_id: "conv-abc123",
          role: "user",
          content: "What is a disposition?",
          created_at: "2026-05-01T09:00:30Z",
        },
        {
          id: "msg-2",
          conversation_id: "conv-abc123",
          role: "assistant",
          content: "A disposition is a personality profile.",
          created_at: "2026-05-01T09:01:00Z",
        },
      ],
    });

    const blocks = await chatRenderer.parse(source, "dojo.conversation.json");

    // Should have: heading + date + participants + rule + 2 messages = 6
    assert.ok(blocks.length >= 6, `Expected at least 6 blocks, got ${blocks.length}`);

    // heading from dojo.title
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "Dojo Session");

    // participants from ["User", preset]
    assert.equal(blocks[2].type, "text");
    assert.ok(blocks[2].content.includes("User"), `Participants should include "User"`);
    assert.ok(blocks[2].content.includes("ADA"), `Participants should include preset "ADA"`);

    // message timestamps come from created_at
    const msgBlock = blocks[4];
    assert.equal(msgBlock.type, "text");
    assert.equal((msgBlock.metadata as Record<string, unknown>).timestamp, "2026-05-01T09:00:30Z");
  });

  test("DojoChat native format: falls back to 'Assistant' when preset is absent", async () => {
    const source = JSON.stringify({
      id: "conv-no-preset",
      title: "No Preset Chat",
      created_at: "2026-05-01T08:00:00Z",
      updated_at: "2026-05-01T08:05:00Z",
      messages: [
        {
          id: "msg-1",
          conversation_id: "conv-no-preset",
          role: "user",
          content: "Hello",
          created_at: "2026-05-01T08:00:10Z",
        },
      ],
    });

    const blocks = await chatRenderer.parse(source, "no-preset.conversation.json");

    // participants block (index 2)
    assert.equal(blocks[2].type, "text");
    assert.ok(blocks[2].content.includes("Assistant"), `Should fall back to "Assistant" when preset is absent, got: "${blocks[2].content}"`);
  });

  // -------------------------------------------------------------------------
  // 3. Disposition → typography hints
  // -------------------------------------------------------------------------
  test("message with disposition produces typography hint metadata keys", async () => {
    const source = JSON.stringify({
      messages: [
        {
          role: "assistant",
          content: "A rich reply.",
          timestamp: "2026-04-08T10:00:00Z",
          disposition: {
            tone: "casual",
            verbosity: "verbose",
            depth: "deep",
            brevity: "minimal",
          },
        },
      ],
    });

    const blocks = await chatRenderer.parse(source, "disposed.chat.json");

    // Only the rule + 1 message block (no metadata header since no metadata field)
    // Find the message block (type=text, chatBubble=true)
    const msgBlock = blocks.find(
      (b) => b.type === "text" && (b.metadata as Record<string, unknown>).chatBubble === true
    );
    assert.ok(msgBlock, "Should have a message bubble block");

    const meta = msgBlock.metadata as Record<string, unknown>;

    // Base bubble keys always present
    assert.equal(meta.chatBubble, true);
    assert.equal(meta.role, "assistant");
    assert.equal(meta.alignment, "left");
    assert.equal(meta.shrinkWrap, true);

    // Disposition-driven typography hints
    // tone:"casual" → casualAxis 0.5
    assert.equal(meta.casualAxis, 0.5, `casualAxis should be 0.5 for tone:casual, got ${meta.casualAxis}`);
    // verbosity:"verbose" → fontSize 12
    assert.equal(meta.fontSize, 12, `fontSize should be 12 for verbosity:verbose, got ${meta.fontSize}`);
    // depth:"deep" → lineHeight 1.4
    assert.equal(meta.lineHeight, 1.4, `lineHeight should be 1.4 for depth:deep, got ${meta.lineHeight}`);
    // brevity:"minimal" → maxBubbleWidth 300
    assert.equal(meta.maxBubbleWidth, 300, `maxBubbleWidth should be 300 for brevity:minimal, got ${meta.maxBubbleWidth}`);
  });

  test("message with NO disposition does not add typography hint keys to metadata", async () => {
    const source = JSON.stringify({
      messages: [
        {
          role: "user",
          content: "Plain message.",
          timestamp: "2026-04-08T10:00:00Z",
        },
      ],
    });

    const blocks = await chatRenderer.parse(source, "no-disposition.chat.json");

    const msgBlock = blocks.find(
      (b) => b.type === "text" && (b.metadata as Record<string, unknown>).chatBubble === true
    );
    assert.ok(msgBlock, "Should have a message bubble block");

    const meta = msgBlock.metadata as Record<string, unknown>;

    // Only the base keys should be present; typography hint keys must be absent
    const hintKeys = ["fontSize", "fontWeight", "lineHeight", "maxBubbleWidth", "casualAxis"];
    for (const key of hintKeys) {
      assert.ok(
        !(key in meta),
        `Typography hint key "${key}" should not be present on a message without disposition, but found value: ${meta[key]}`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 4. Invalid JSON → rejects with filename in message
  // -------------------------------------------------------------------------
  test("invalid JSON source rejects with a message containing the filename", async () => {
    const filename = "broken.chat.json";
    await assert.rejects(
      () => chatRenderer.parse("{ this is not valid JSON }", filename),
      (err: unknown) => {
        assert.ok(err instanceof Error, "Should throw an Error");
        assert.ok(
          err.message.includes(filename),
          `Error message should contain "${filename}", got: "${err.message}"`
        );
        return true;
      }
    );
  });

  // -------------------------------------------------------------------------
  // 5. Unrecognized shape → throws "Unrecognized chat format"
  // -------------------------------------------------------------------------
  test("empty object {} throws Unrecognized chat format", async () => {
    await assert.rejects(
      () => chatRenderer.parse("{}", "empty.chat.json"),
      (err: unknown) => {
        assert.ok(err instanceof Error, "Should throw an Error");
        assert.ok(
          err.message.toLowerCase().includes("unrecognized"),
          `Error message should contain "Unrecognized", got: "${err.message}"`
        );
        return true;
      }
    );
  });

  test("object with unrelated keys {foo:1} throws Unrecognized chat format", async () => {
    await assert.rejects(
      () => chatRenderer.parse(JSON.stringify({ foo: 1 }), "unknown.chat.json"),
      (err: unknown) => {
        assert.ok(err instanceof Error, "Should throw an Error");
        assert.ok(
          err.message.toLowerCase().includes("unrecognized"),
          `Error message should contain "Unrecognized", got: "${err.message}"`
        );
        return true;
      }
    );
  });
});

// ---------------------------------------------------------------------------
// Markdown renderer — pure parse unit tests
// These call markdownRenderer.parse directly without touching the PDF pipeline.
// ---------------------------------------------------------------------------

describe("Markdown renderer — pure parse", () => {
  // -------------------------------------------------------------------------
  // 1. Frontmatter extraction
  // -------------------------------------------------------------------------
  test("frontmatter with name+description injects heading + subtitle text blocks, then parses body", async () => {
    const source = `---
name: My Document
description: A short description
---

# Body Heading

Body paragraph.
`;

    const blocks = await markdownRenderer.parse(source, "test.md");

    // Block 0: heading from frontmatter.name
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "My Document");
    assert.equal((blocks[0].metadata as Record<string, unknown>).level, 1);
    assert.equal((blocks[0].metadata as Record<string, unknown>).fromFrontmatter, true);

    // Block 1: subtitle text block from frontmatter.description
    assert.equal(blocks[1].type, "text");
    assert.equal(blocks[1].content, "A short description");
    assert.equal((blocks[1].metadata as Record<string, unknown>).subtitle, true);

    // Body still parsed: heading + paragraph follow
    assert.equal(blocks[2].type, "heading");
    assert.equal(blocks[2].content, "Body Heading");
    assert.equal((blocks[2].metadata as Record<string, unknown>).level, 1);

    assert.equal(blocks[3].type, "text");
    assert.equal(blocks[3].content, "Body paragraph.");
  });

  test("frontmatter falls back to title when name is absent", async () => {
    const source = `---
title: Fallback Title
description: Still has a description
---

Body text.
`;

    const blocks = await markdownRenderer.parse(source, "fallback.md");

    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "Fallback Title");
    assert.equal((blocks[0].metadata as Record<string, unknown>).fromFrontmatter, true);
  });

  test("frontmatter with neither name nor title injects no heading block, but still injects description subtitle", async () => {
    const source = `---
description: Orphan description
---

Body text.
`;

    const blocks = await markdownRenderer.parse(source, "no-name.md");

    // No heading block injected — first block should be the subtitle text
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[0].content, "Orphan description");
    assert.equal((blocks[0].metadata as Record<string, unknown>).subtitle, true);
  });

  test("no frontmatter: body parsed normally with no injected header blocks", async () => {
    const source = `# Just a Heading

Just a paragraph.
`;

    const blocks = await markdownRenderer.parse(source, "no-frontmatter.md");

    assert.equal(blocks.length, 2, `Expected exactly 2 blocks, got ${blocks.length}`);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "Just a Heading");
    assert.equal(blocks[0].metadata?.fromFrontmatter, undefined, "Should not carry fromFrontmatter when there's no frontmatter");
    assert.equal(blocks[1].type, "text");
    assert.equal(blocks[1].content, "Just a paragraph.");
  });

  test("CRLF frontmatter delimiters are recognized", async () => {
    const source = "---\r\nname: CRLF Doc\r\n---\r\n\r\nBody line.\r\n";

    const blocks = await markdownRenderer.parse(source, "crlf.md");

    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "CRLF Doc");
    // Body should still parse — last block should carry the body text
    const textBlock = blocks.find((b) => b.type === "text");
    assert.ok(textBlock, "Should have a parsed text block from the CRLF body");
    assert.equal(textBlock!.content, "Body line.");
  });

  // -------------------------------------------------------------------------
  // 2. tokensToBlocks — main token type mapping
  // -------------------------------------------------------------------------
  test("heading tokens map to type:heading with metadata.level", async () => {
    const source = `# H1\n\n## H2\n\n### H3\n`;
    const blocks = await markdownRenderer.parse(source, "headings.md");

    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "H1");
    assert.equal((blocks[0].metadata as Record<string, unknown>).level, 1);
    assert.equal(blocks[1].type, "heading");
    assert.equal((blocks[1].metadata as Record<string, unknown>).level, 2);
    assert.equal(blocks[2].type, "heading");
    assert.equal((blocks[2].metadata as Record<string, unknown>).level, 3);
  });

  test("paragraph tokens map to type:text", async () => {
    const source = `A simple paragraph of text.\n`;
    const blocks = await markdownRenderer.parse(source, "paragraph.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[0].content, "A simple paragraph of text.");
  });

  test("fenced code block maps to type:code with metadata.lang from the fence info string", async () => {
    const source = "```typescript\nconst x: number = 1;\n```\n";
    const blocks = await markdownRenderer.parse(source, "code.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "code");
    assert.equal(blocks[0].content, "const x: number = 1;");
    assert.equal((blocks[0].metadata as Record<string, unknown>).lang, "typescript");
  });

  test("fenced code block with no language info: marked yields lang '' (the ?? \"text\" fallback only catches null/undefined, not '')", async () => {
    const source = "```\nplain fenced content\n```\n";
    const blocks = await markdownRenderer.parse(source, "code-no-lang.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "code");
    // NOTE: marked's lexer sets `lang` to "" (not null/undefined) when there's no
    // fence info string, so the renderer's `t.lang ?? "text"` fallback never fires
    // in practice for this case — the actual metadata.lang is "".
    assert.equal((blocks[0].metadata as Record<string, unknown>).lang, "");
  });

  test("hr token maps to type:rule with empty content", async () => {
    const source = `Above.\n\n---\n\nBelow.\n`;
    const blocks = await markdownRenderer.parse(source, "rule.md");

    const ruleBlock = blocks.find((b) => b.type === "rule");
    assert.ok(ruleBlock, "Should have a rule block");
    assert.equal(ruleBlock!.content, "");
  });

  test("table token maps to type:table with metadata.header and metadata.rows", async () => {
    const source = `| Col A | Col B |\n|-------|-------|\n| a1 | b1 |\n| a2 | b2 |\n`;
    const blocks = await markdownRenderer.parse(source, "table.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "table");
    const meta = blocks[0].metadata as Record<string, unknown>;
    assert.deepEqual(meta.header, ["Col A", "Col B"]);
    assert.deepEqual(meta.rows, [
      ["a1", "b1"],
      ["a2", "b2"],
    ]);
  });

  test("ordered list maps to type:text with numbered content and metadata.listType:'ol'", async () => {
    const source = `1. First\n2. Second\n3. Third\n`;
    const blocks = await markdownRenderer.parse(source, "ordered-list.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.equal((blocks[0].metadata as Record<string, unknown>).listType, "ol");
    assert.equal(blocks[0].content, "1. First\n2. Second\n3. Third");
  });

  test("unordered list maps to type:text with '  - ' prefixed content and metadata.listType:'ul'", async () => {
    const source = `- First\n- Second\n- Third\n`;
    const blocks = await markdownRenderer.parse(source, "unordered-list.md");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.equal((blocks[0].metadata as Record<string, unknown>).listType, "ul");
    assert.equal(blocks[0].content, "  - First\n  - Second\n  - Third");
  });

  test("blockquote: inner blocks are recursively parsed and each carries metadata.blockquote:true", async () => {
    const source = `> Quoted paragraph.\n>\n> ## Quoted Heading\n`;
    const blocks = await markdownRenderer.parse(source, "blockquote.md");

    assert.ok(blocks.length >= 2, `Expected at least 2 inner blocks, got ${blocks.length}`);
    for (const block of blocks) {
      assert.equal((block.metadata as Record<string, unknown>).blockquote, true, `Block of type "${block.type}" should carry metadata.blockquote:true`);
    }
    const headingBlock = blocks.find((b) => b.type === "heading");
    assert.ok(headingBlock, "Should have an inner heading block");
    assert.equal(headingBlock!.content, "Quoted Heading");
    const textBlock = blocks.find((b) => b.type === "text");
    assert.ok(textBlock, "Should have an inner text block");
    assert.equal(textBlock!.content, "Quoted paragraph.");
  });
});

// ---------------------------------------------------------------------------
// Structured renderer — pure parse unit tests
// These call isStructuredFile / structuredRenderer.parse directly without
// touching the PDF pipeline.
// ---------------------------------------------------------------------------

describe("Structured renderer — pure parse", () => {
  // -------------------------------------------------------------------------
  // 1. isStructuredFile — explicit filename patterns (TRUE)
  // -------------------------------------------------------------------------
  test("filename ending 'skill.md' (case-insensitive) is structured", () => {
    assert.equal(isStructuredFile("no markers here", "skills/foo/SKILL.md"), true);
  });

  test("filename containing 'adr-' is structured", () => {
    assert.equal(isStructuredFile("no markers here", "decisions/ADR-001-use-pretext.md"), true);
  });

  test("filename containing '/decisions/' is structured", () => {
    assert.equal(isStructuredFile("no markers here", "AgenticStackOrchestration/decisions/042-foo.md"), true);
  });

  test("filename ending 'status.md' is structured", () => {
    assert.equal(isStructuredFile("no markers here", "project/STATUS.md"), true);
  });

  test("filename containing '/handoffs/' is structured", () => {
    assert.equal(isStructuredFile("no markers here", "team/handoffs/2026-07-10_foo.md"), true);
  });

  // -------------------------------------------------------------------------
  // 2. isStructuredFile — YAML frontmatter detection (TRUE)
  // -------------------------------------------------------------------------
  test("YAML frontmatter with name+description+'skill' marks the file structured", () => {
    const source = `---
name: My Widget
description: A skill for building widgets
---

Body.
`;
    assert.equal(isStructuredFile(source, "unrelated-name.md"), true);
  });

  test("YAML frontmatter with name+description+'seed' marks the file structured", () => {
    const source = `---
name: My Seed
description: A reusable seed pattern
---

Body.
`;
    assert.equal(isStructuredFile(source, "unrelated-name.md"), true);
  });

  // -------------------------------------------------------------------------
  // 3. isStructuredFile — FALSE branches
  // -------------------------------------------------------------------------
  test("plain .md filename with no structured markers and no frontmatter is not structured", () => {
    assert.equal(isStructuredFile("Just a paragraph of body text.", "notes.md"), false);
  });

  test("frontmatter with name+description but missing 'skill'/'seed' is not structured", () => {
    const source = `---
name: My Widget
description: A generic description with neither magic word
---

Body.
`;
    assert.equal(isStructuredFile(source, "unrelated-name.md"), false);
  });

  // -------------------------------------------------------------------------
  // 4. structuredRenderer.parse — document-type badge
  // -------------------------------------------------------------------------
  test("SKILL.md source: first emitted block is the uppercased 'SKILL' badge with the skill color", async () => {
    const source = `# Test Skill\n\nBody.\n`;
    const blocks = await structuredRenderer.parse(source, "skills/foo/SKILL.md");

    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[0].content, "SKILL");
    const meta = blocks[0].metadata as Record<string, unknown>;
    assert.equal(meta.badge, true);
    assert.equal(meta.badgeColor, "#4A90D9");
  });

  test("plain notes.md (no docType) yields no badge block", async () => {
    const source = `# Hi\n\nbody\n`;
    const blocks = await structuredRenderer.parse(source, "notes.md");

    assert.ok(
      !blocks.some((b) => (b.metadata as Record<string, unknown> | undefined)?.badge === true),
      "Should not have a badge block when detectDocType returns null"
    );
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, "Hi");
  });

  // -------------------------------------------------------------------------
  // 5. structuredRenderer.parse — roman-numeral section numbering
  // -------------------------------------------------------------------------
  test("level-2 heading matching '^[IVX]+\\.\\s' gets an incrementing sectionNumber + structured:true", async () => {
    const source = `## I. Philosophy\n\nFirst.\n\n## II. When To Use\n\nSecond.\n`;
    const blocks = await structuredRenderer.parse(source, "skills/foo/SKILL.md");

    const headings = blocks.filter((b) => b.type === "heading");
    assert.equal(headings.length, 2);
    assert.equal((headings[0].metadata as Record<string, unknown>).sectionNumber, 1);
    assert.equal((headings[0].metadata as Record<string, unknown>).structured, true);
    assert.equal((headings[1].metadata as Record<string, unknown>).sectionNumber, 2);
    assert.equal((headings[1].metadata as Record<string, unknown>).structured, true);
  });

  test("a normal '## Heading' (no roman-numeral prefix) does not get sectionNumber", async () => {
    const source = `## Regular Heading\n\nBody.\n`;
    const blocks = await structuredRenderer.parse(source, "skills/foo/SKILL.md");

    const heading = blocks.find((b) => b.type === "heading" && b.content === "Regular Heading");
    assert.ok(heading, "Should have the regular heading block");
    assert.equal((heading!.metadata as Record<string, unknown>).sectionNumber, undefined);
  });

  // -------------------------------------------------------------------------
  // 6. structuredRenderer.parse — checklist detection
  // -------------------------------------------------------------------------
  test("a text block whose content literally includes '[ ]'/'[x]'/'[X]' gets metadata.checklist:true", async () => {
    const source = `Status brackets: [ ] pending, [x] done, [X] also-done — as literal paragraph text, not a Markdown list.\n`;
    const blocks = await structuredRenderer.parse(source, "skills/foo/SKILL.md");

    const textBlock = blocks.find((b) => b.type === "text" && b.content.includes("[ ]"));
    assert.ok(textBlock, "Should have a text block with literal checkbox brackets");
    assert.equal((textBlock!.metadata as Record<string, unknown>).checklist, true);
  });

  // NOTE: markdown checklist syntax (`- [ ] item`) is parsed by `marked` as a GFM
  // task-list item — `marked` strips the "[ ]"/"[x]" checkbox syntax entirely from
  // `item.text`, so the base markdown renderer's "list" token becomes a type:"text"
  // block whose content is "  - item" with NO literal "[ ]"/"[x]" substring. The
  // structured enhancer's `block.content.includes("[ ]")` guard therefore never
  // fires for real Markdown checklists — only for literal bracket text inside a
  // paragraph (as tested above). This is the as-observed, not as-assumed, behavior;
  // no source change was made.
  test("a real Markdown checklist ('- [ ] item') does NOT get metadata.checklist:true (documented gap)", async () => {
    const source = `- [ ] task one\n- [x] task two\n`;
    const blocks = await structuredRenderer.parse(source, "skills/bar/SKILL.md");

    const listBlock = blocks.find(
      (b) => b.type === "text" && (b.metadata as Record<string, unknown> | undefined)?.listType === "ul"
    );
    assert.ok(listBlock, "Should have the list block from the base markdown parse");
    assert.ok(!listBlock!.content.includes("[ ]"), "marked strips checkbox syntax from list item text");
    assert.equal(
      (listBlock!.metadata as Record<string, unknown>).checklist,
      undefined,
      "checklist guard never fires for markdown list items"
    );
  });
});

// ---------------------------------------------------------------------------
// HTML renderer — pure parse unit tests
// These call htmlRenderer.parse directly without touching the PDF pipeline.
// ---------------------------------------------------------------------------

describe("HTML renderer — pure parse", () => {
  // -------------------------------------------------------------------------
  // 1. <title> → heading level 1
  // -------------------------------------------------------------------------
  test("<title> maps to heading level 1, entity-decoded, no tag-stripping applied", async () => {
    const source = `<html><head><title>Tom &amp; Jerry: &lt;a&gt; vs &quot;b&quot; &#39;c&#39;</title></head><body></body></html>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[0].content, `Tom & Jerry: <a> vs "b" 'c'`);
    assert.equal((blocks[0].metadata as Record<string, unknown>).level, 1);
  });

  // -------------------------------------------------------------------------
  // 2. <h1>..<h6> → heading blocks
  // -------------------------------------------------------------------------
  test("<h1>..<h6> map to heading blocks with parsed metadata.level and inner tags stripped", async () => {
    const source = `<h1>One</h1><h2>Two</h2><h3>Three <em>Emph</em></h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const headings = blocks.filter((b) => b.type === "heading");
    assert.equal(headings.length, 6);
    assert.deepEqual(
      headings.map((h) => (h.metadata as Record<string, unknown>).level),
      [1, 2, 3, 4, 5, 6]
    );
    assert.equal(headings[2].content, "Three Emph", "Inner <em> tags should be stripped, text preserved");
  });

  // -------------------------------------------------------------------------
  // 3. <p> → text blocks; empty paragraphs skipped
  // -------------------------------------------------------------------------
  test("<p> maps to type:text blocks", async () => {
    const source = `<p>First paragraph.</p><p>Second paragraph.</p>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const textBlocks = blocks.filter((b) => b.type === "text");
    assert.equal(textBlocks.length, 2);
    assert.equal(textBlocks[0].content, "First paragraph.");
    assert.equal(textBlocks[1].content, "Second paragraph.");
  });

  test("empty and whitespace-only paragraphs are skipped", async () => {
    const source = `<p>   </p><p></p><p>Real content.</p>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const textBlocks = blocks.filter((b) => b.type === "text");
    assert.equal(textBlocks.length, 1);
    assert.equal(textBlocks[0].content, "Real content.");
  });

  // -------------------------------------------------------------------------
  // 4. <pre><code class="language-xxx"> → code block
  // -------------------------------------------------------------------------
  // NOTE: the capture regex is
  //   /<pre[^>]*><code[^>]*(?:class="[^"]*language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi
  // The FIRST `[^>]*` after `<code` is greedy and consumes every non-'>' char up to
  // the closing '>' — including the class attribute — before the optional language
  // group ever gets a chance to match (it matches empty and succeeds trivially, so
  // the engine never backtracks into it). As a result match[1] (the language) is
  // ALWAYS undefined, and metadata.lang is ALWAYS the `?? "text"` fallback, even
  // when a `language-xxx` class is present. Verified empirically; not fixed here.
  test('<pre><code class="language-xxx"> never actually captures the language — metadata.lang is always the "text" fallback', async () => {
    const source = `<pre><code class="language-python">print(1)</code></pre>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const codeBlock = blocks.find((b) => b.type === "code");
    assert.ok(codeBlock, "Should have a code block");
    assert.equal(codeBlock!.content, "print(1)");
    assert.equal((codeBlock!.metadata as Record<string, unknown>).lang, "text");
  });

  test("<pre><code> with no language class also falls back to metadata.lang:'text' (same fallback path)", async () => {
    const source = `<pre><code>plain content</code></pre>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const codeBlock = blocks.find((b) => b.type === "code");
    assert.ok(codeBlock, "Should have a code block");
    assert.equal((codeBlock!.metadata as Record<string, unknown>).lang, "text");
  });

  // -------------------------------------------------------------------------
  // 5. <script>, <style>, <!-- comments --> stripped
  // -------------------------------------------------------------------------
  test("<script>, <style>, and HTML comments are stripped before extraction and never appear in any block", async () => {
    const source = `<html><head><script>var secretScript = 1;</script><style>.secretStyle { color: red; }</style></head><body><!-- a secret comment --><p>Visible paragraph.</p></body></html>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const allContent = blocks.map((b) => b.content).join("\n");
    assert.ok(!allContent.includes("secretScript"), "Script content should be stripped");
    assert.ok(!allContent.includes("secretStyle"), "Style content should be stripped");
    assert.ok(!allContent.includes("secret comment"), "Comment content should be stripped");
    assert.ok(allContent.includes("Visible paragraph."), "Visible text should remain");
  });

  // -------------------------------------------------------------------------
  // 6. Entity decoding
  // -------------------------------------------------------------------------
  test("decodes &amp; &quot; &#39; &nbsp;, numeric &#NN; and hex &#xHH; entities in a paragraph", async () => {
    const source = `<p>Fixed: &amp; and &quot;quoted&quot; and it&#39;s nbsp:&nbsp;end numeric:&#65; hex:&#x42;</p>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const textBlock = blocks.find((b) => b.type === "text");
    assert.ok(textBlock, "Should have a text block");
    assert.equal(textBlock!.content, `Fixed: & and "quoted" and it's nbsp: end numeric:A hex:B`);
  });

  // NOTE: decodeEntities runs BEFORE stripTags for paragraphs/headings. If the
  // decoded entities happen to form something that LOOKS like a tag (e.g. &lt;
  // and &gt; decoding to a literal "<...>"), stripTags's `/<[^>]+>/g` regex will
  // then match and remove it — silently eating decoded angle-bracket content
  // rather than preserving it as visible text. Verified empirically; documented
  // as-observed behavior, not a bug fix.
  test("decoded &lt;/&gt; can be silently eaten by the tag-stripping regex (documented gap)", async () => {
    const source = `<p>Before &lt;tag&gt; After</p>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    const textBlock = blocks.find((b) => b.type === "text");
    assert.ok(textBlock, "Should have a text block");
    assert.equal(textBlock!.content, "Before After");
  });

  // -------------------------------------------------------------------------
  // 7. No-structured-content fallback
  // -------------------------------------------------------------------------
  test("source with visible body text but no title/heading/p/code yields a single text block from the stripped body", async () => {
    const source = `<html><body>bare text with no tags</body></html>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[0].content, "bare text with no tags");
  });

  test("a bare <div> with no <body> wrapper falls back to the full cleaned source as text", async () => {
    const source = `<div>just a div, no body wrapper</div>`;
    const blocks = await htmlRenderer.parse(source, "test.html");

    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].type, "text");
    assert.equal(blocks[0].content, "just a div, no body wrapper");
  });
});

// ---------------------------------------------------------------------------
// Code renderer — pure parse unit tests
// These call codeRenderer.parse directly without touching the PDF pipeline.
// ---------------------------------------------------------------------------

describe("Code renderer — pure parse", () => {
  // -------------------------------------------------------------------------
  // 1. Block order + shape
  // -------------------------------------------------------------------------
  test("emits heading (fileHeader) → text subtitle → rule → code block, in that order", async () => {
    const source = "line1\nline2\nline3\n";
    const blocks = await codeRenderer.parse(source, "path/to/foo.ts");

    assert.equal(blocks.length, 4);
    assert.equal(blocks[0].type, "heading");
    assert.equal(blocks[1].type, "text");
    assert.equal(blocks[2].type, "rule");
    assert.equal(blocks[3].type, "code");
  });

  test("file header content is the basename, not the full path", async () => {
    const blocks = await codeRenderer.parse("const x = 1;\n", "path/to/foo.ts");

    assert.equal(blocks[0].content, "foo.ts");
    const meta = blocks[0].metadata as Record<string, unknown>;
    assert.equal(meta.level, 2);
    assert.equal(meta.fileHeader, true);
  });

  test("subtitle block content is '<lang> | <n> lines' with metadata.subtitle and metadata.muted", async () => {
    const source = "line1\nline2\nline3\n";
    const blocks = await codeRenderer.parse(source, "path/to/foo.ts");

    assert.equal(blocks[1].content, "typescript | 4 lines");
    const meta = blocks[1].metadata as Record<string, unknown>;
    assert.equal(meta.subtitle, true);
    assert.equal(meta.muted, true);
  });

  test("rule block has empty content", async () => {
    const blocks = await codeRenderer.parse("x\n", "foo.ts");
    assert.equal(blocks[2].type, "rule");
    assert.equal(blocks[2].content, "");
  });

  test("code block content is the full untouched source, with metadata carrying lang/filename/lineCount", async () => {
    const source = "line1\nline2\nline3\n";
    const filename = "path/to/foo.ts";
    const blocks = await codeRenderer.parse(source, filename);

    assert.equal(blocks[3].type, "code");
    assert.equal(blocks[3].content, source);
    const meta = blocks[3].metadata as Record<string, unknown>;
    assert.equal(meta.lang, "typescript");
    assert.equal(meta.filename, filename);
    assert.equal(meta.lineCount, 4);
  });

  // -------------------------------------------------------------------------
  // 2. Language detection via extension
  // -------------------------------------------------------------------------
  test("detects language from extension: .ts→typescript, .go→go, .py→python", async () => {
    const cases: Array<[string, string]> = [
      ["file.ts", "typescript"],
      ["file.go", "go"],
      ["file.py", "python"],
    ];
    for (const [filename, expectedLang] of cases) {
      const blocks = await codeRenderer.parse("code\n", filename);
      const codeBlock = blocks.find((b) => b.type === "code")!;
      assert.equal(
        (codeBlock.metadata as Record<string, unknown>).lang,
        expectedLang,
        `Expected lang "${expectedLang}" for ${filename}`
      );
    }
  });

  test("unknown extension falls back to metadata.lang:'text'", async () => {
    const blocks = await codeRenderer.parse("mystery content\n", "notes.xyz");
    const codeBlock = blocks.find((b) => b.type === "code")!;
    assert.equal((codeBlock.metadata as Record<string, unknown>).lang, "text");
  });

  // -------------------------------------------------------------------------
  // 3. Line counting
  // -------------------------------------------------------------------------
  test("lineCount and the subtitle count both equal source.split('\\n').length for a multi-line fixture", async () => {
    const source = "a\nb\nc\nd\ne\n";
    const blocks = await codeRenderer.parse(source, "multi.py");
    const expected = source.split("\n").length;

    const codeBlock = blocks.find((b) => b.type === "code")!;
    assert.equal((codeBlock.metadata as Record<string, unknown>).lineCount, expected);

    const subtitleBlock = blocks.find((b) => (b.metadata as Record<string, unknown> | undefined)?.subtitle === true)!;
    assert.equal(subtitleBlock.content, `python | ${expected} lines`);
  });

  test("filename with no directory component still yields the whole filename as the header", async () => {
    const blocks = await codeRenderer.parse("x\n", "standalone.go");
    assert.equal(blocks[0].content, "standalone.go");
  });
});

// ---------------------------------------------------------------------------
// Renderer selection — selectRenderer
// Pure dispatch function: no FS, no canvas, no pdf-lib, no network.
// Priority order per the doc-comment: (1) explicit override, (2) structured
// detection, (3) chat JSON detection, (4) extension matching, (5) codeRenderer
// fallback.
// ---------------------------------------------------------------------------

describe("Renderer selection — selectRenderer", () => {
  // -------------------------------------------------------------------------
  // 1. Explicit renderer name override
  // -------------------------------------------------------------------------
  test("explicit:'chat' resolves to chatRenderer regardless of filename/source", () => {
    const renderer = selectRenderer("notes.md", "irrelevant source", "chat");
    assert.equal(renderer, chatRenderer);
  });

  test("explicit:'html' resolves to htmlRenderer regardless of filename/source", () => {
    const renderer = selectRenderer("notes.md", "irrelevant source", "html");
    assert.equal(renderer, htmlRenderer);
  });

  test("explicit:'markdown' resolves to markdownRenderer regardless of filename/source", () => {
    const renderer = selectRenderer("notes.txt", "irrelevant source", "markdown");
    assert.equal(renderer, markdownRenderer);
  });

  test("explicit:'code' resolves to codeRenderer regardless of filename/source", () => {
    const renderer = selectRenderer("notes.md", "irrelevant source", "code");
    assert.equal(renderer, codeRenderer);
  });

  test("explicit:'structured' resolves to structuredRenderer even though it is NOT in the renderers array", () => {
    // structuredRenderer.extensions is [] and it is deliberately excluded from
    // the internal `renderers` array (see index.ts comment) — it is only
    // reachable via this explicit-name special case or content-based detection.
    const renderer = selectRenderer("notes.md", "irrelevant source", "structured");
    assert.equal(renderer, structuredRenderer);
  });

  test("explicit:'auto' is treated as no override — falls through to normal detection", () => {
    const renderer = selectRenderer("page.html", "<p>hi</p>", "auto");
    assert.equal(renderer, htmlRenderer);
  });

  test("explicit with an unrecognized name throws 'Unknown renderer: <name>'", () => {
    assert.throws(
      () => selectRenderer("notes.md", "irrelevant source", "made-up-renderer"),
      /Unknown renderer: made-up-renderer/
    );
  });

  // -------------------------------------------------------------------------
  // 2. Structured file detection (content-based, only for .md/.markdown)
  // -------------------------------------------------------------------------
  test("a structured .md file (e.g. SKILL.md) resolves to structuredRenderer via content/filename detection", () => {
    const renderer = selectRenderer("skills/foo/SKILL.md", "# Test Skill\n\nBody.\n");
    assert.equal(renderer, structuredRenderer);
  });

  test("a non-structured .md file falls through structured detection to markdownRenderer via the extension loop", () => {
    const renderer = selectRenderer("notes.md", "Just a plain paragraph, no structured markers.");
    assert.equal(renderer, markdownRenderer);
  });

  // NOTE: the structured-detection branch only fires for ext === ".md" or
  // ".markdown" — a structured-looking file with a ".mdx" extension (e.g. a
  // filename matching "skill.mdx") never reaches isStructuredFile() at all,
  // because the `(ext === ".md" || ext === ".markdown")` guard excludes it.
  // It falls straight through to the extension loop, where markdownRenderer's
  // extensions array (which DOES include ".mdx") matches instead. Verified
  // against the actual source; not a source change.
  test("a structured-looking filename with a .mdx extension is NOT detected as structured (guard excludes .mdx)", () => {
    const renderer = selectRenderer("skills/foo/SKILL.mdx", "# Test Skill\n\nBody.\n");
    assert.equal(renderer, markdownRenderer, "structured guard only checks .md/.markdown, so .mdx bypasses it entirely");
  });

  // -------------------------------------------------------------------------
  // 3. Chat JSON detection (filename-suffix based, checked before the
  //    extension loop)
  // -------------------------------------------------------------------------
  // NOTE: this branch is NOT redundant with the extension loop below — it is
  // the ONLY way selectRenderer ever reaches chatRenderer via filename alone.
  // node:path's extname() only returns the segment after the LAST dot, so
  // extname("test.chat.json") === ".json", never ".chat.json". chatRenderer's
  // own `extensions: [".chat.json", ".conversation.json"]` entries (declared
  // in chat.ts) can therefore never match inside the extension-matching loop
  // (step 4) — that loop only ever compares against a single-segment ext like
  // ".json". Proof: codeRenderer's extensions list also contains plain
  // ".json" (see code.ts EXTENSION_TO_LANG), so if this endsWith() special
  // case were removed, a "*.chat.json" file would silently fall through to
  // codeRenderer (plain-text/code rendering) instead of remaining
  // unclassified — because ".json" still matches code's extension list.
  // Verified empirically (`extname("test.chat.json")` === ".json") and
  // against source; no source change made.
  test("*.chat.json suffix resolves to chatRenderer (extname() alone would only ever see '.json')", () => {
    const renderer = selectRenderer("conversation.chat.json", '{"messages":[]}');
    assert.equal(renderer, chatRenderer);
  });

  test("*.conversation.json suffix resolves to chatRenderer", () => {
    const renderer = selectRenderer("dojo.conversation.json", '{"messages":[]}');
    assert.equal(renderer, chatRenderer);
  });

  test("a plain .json file (no .chat.json/.conversation.json suffix) is NOT routed to chatRenderer — it falls to codeRenderer via the extension loop", () => {
    const renderer = selectRenderer("data.json", '{"foo":1}');
    assert.equal(renderer, codeRenderer, "plain .json matches codeRenderer's extensions list (EXTENSION_TO_LANG['.json'])");
  });

  // -------------------------------------------------------------------------
  // 4. Extension-based matching over the renderers array
  //    (order: chat, html, markdown, code)
  // -------------------------------------------------------------------------
  test("'.html' extension resolves to htmlRenderer via the extension loop", () => {
    const renderer = selectRenderer("page.html", "<p>hi</p>");
    assert.equal(renderer, htmlRenderer);
  });

  test("'.htm' and '.xhtml' extensions also resolve to htmlRenderer", () => {
    assert.equal(selectRenderer("page.htm", "<p>hi</p>"), htmlRenderer);
    assert.equal(selectRenderer("page.xhtml", "<p>hi</p>"), htmlRenderer);
  });

  test("'.markdown' extension resolves to markdownRenderer", () => {
    const renderer = selectRenderer("notes.markdown", "plain body");
    assert.equal(renderer, markdownRenderer);
  });

  test("'.mdx' extension resolves to markdownRenderer", () => {
    const renderer = selectRenderer("notes.mdx", "plain body");
    assert.equal(renderer, markdownRenderer);
  });

  test("a code extension (e.g. '.ts') resolves to codeRenderer via the extension loop", () => {
    const renderer = selectRenderer("index.ts", "const x = 1;");
    assert.equal(renderer, codeRenderer);
  });

  test("extension matching is case-insensitive: '.MD' resolves the same as '.md'", () => {
    const renderer = selectRenderer("NOTES.MD", "plain body, no structured markers");
    assert.equal(renderer, markdownRenderer, "extname(...).toLowerCase() should normalize '.MD' to '.md'");
  });

  test("extension matching is case-insensitive: '.HTML' resolves the same as '.html'", () => {
    const renderer = selectRenderer("PAGE.HTML", "<p>hi</p>");
    assert.equal(renderer, htmlRenderer);
  });

  // -------------------------------------------------------------------------
  // 5. Fallback to codeRenderer (treat as plain text)
  // -------------------------------------------------------------------------
  test("an unrecognized extension falls back to codeRenderer", () => {
    const renderer = selectRenderer("mystery.xyz", "some unclassified content");
    assert.equal(renderer, codeRenderer);
  });

  test("a filename with no extension at all falls back to codeRenderer", () => {
    const renderer = selectRenderer("README", "some unclassified content");
    assert.equal(renderer, codeRenderer);
  });
});
