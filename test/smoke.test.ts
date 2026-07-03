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
