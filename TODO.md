# Pretext PDF — Follow-up Actions

## Quality Fixes
- [x] 1. Wire Shiki syntax highlighting into code renderer
- [x] 2. Pre-instance monospace font (RecursiveMono-Regular.ttf) for code blocks

## Ecosystem Wiring
- [x] 3. Register in supply chain pipeline (manifest.json + MCP servers discovered)
- [x] 4. Add to AgenticGateway config (gateway-config.yaml, namespace: pretext)

## Distribution
- [x] 5. Dockerfile written (multi-stage Node+Cairo Alpine)
- [x] 9. npm publish setup (files, bin, repository, prepublishOnly)

## Integration
- [x] 6. Wire DojoChat native conversation format (auto-detected via normalizeChat())
- [x] 7. Complete image block rendering (embedPng/embedJpg with auto-scaling)

## Observability
- [x] 8. OTEL-compatible tracing (tool.export spans with file_count, pages, bytes, font.custom)

## Validation
- [x] 10. Dogfood test — pdf-export skill exported as 4-page, 34.3KB PDF

## Remaining (future)
- [ ] `docker build` + push to ghcr.io/dojogenesis/pretext-pdf-mcp
- [ ] `npm publish` to npm registry
- [ ] Run supply-chain-refresh.sh to normalize new skills into CAS
- [ ] Add Recursive bold instance (RecursiveMonoLnrSt-Bold.ttf) for code emphasis
