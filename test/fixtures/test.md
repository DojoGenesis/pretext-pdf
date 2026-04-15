---
name: test-document
description: A test document for smoke testing
---

# Heading One

This is a paragraph with some text. It should be wrapped properly using Pretext's
Canvas-based typography measurement engine. The line breaks should be computed from
actual font metrics, not crude character-count heuristics.

## Code Example

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

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
