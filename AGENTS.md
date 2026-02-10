# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Build all packages
bun run build

# Run all tests
bun run test

# Lint
bun run lint

# Type check
bun run check-types

# Format
bun run format

# Run single package test
cd packages/streamui && bun run test

# Run example app
bun run --filter=chat dev
```

Quality check before commit: `bun run format && bun run lint && bun run check-types && bun run test`

## Architecture

StreamUI is a Transport layer for Vercel AI SDK v6 that streams json-render UI components from LLMs via `useChat`.

```
Server: catalog.prompt() → system prompt → LLM → text with JSONL patches
                            ↓
Client: UITransport parses JSONL → builds Spec → emits data-ui chunks
                            ↓
UI:     useChat message.parts → Renderer (@json-render/react)
```

### Monorepo (bun workspaces + Turborepo)

- `packages/streamui/` — Core SDK (npm: `streamui`)
- `packages/eslint-config/` — Shared ESLint config (`@repo/eslint-config`)
- `packages/typescript-config/` — Shared TS config (`@repo/typescript-config`)
- `examples/next/chat/` — Next.js example app

### Core Modules (`packages/streamui/src/`)

**transport.ts** — `UITransport` implements AI SDK's `ChatTransport`. Posts to API, processes response stream, emits three chunk types: `data-ui` (Spec), `data-ui-text` (non-patch text), pass-through (tool calls, etc.).

**spec-stream.ts** — `SpecStreamBuffer` handles JSONL parsing across chunk boundaries. `applySpecPatch` applies RFC 6902 patches immutably. `buildSpec` accumulates patches into a Spec. Intentionally self-implemented (not using json-render's SpecStreamCompiler) because streamui needs mixed text + patches in the same stream.

**schema.ts** — `defaultSchema` defines the Element Tree Spec format. `createCatalog` wraps `@json-render/core`'s `defineCatalog` and injects STREAMUI_RULES (no code fences, raw JSONL). `createUserPrompt` wraps core's `buildUserPrompt` with the same rules.

**types.ts** — `UIDataTypes` (for `useChat<UIDataTypes>`), `SpecPatch` (RFC 6902 op), `ParsedLine` (patch or text).

**utils.ts** — `convertUIMessagesToModelMessages` transforms UIMessage[] for LLM context, converting `data-ui` parts to JSON text representation.

### Dependencies

- `@json-render/core` (dependency) — Schema, Catalog, Spec types. Minimal re-export policy: only re-export what streamui wraps or adds value to.
- `ai` (peer dependency) — AI SDK v6. Users choose their version.
- `@json-render/react` — Not a dependency of streamui. Users install directly for Renderer.

> `@json-render/core` is in early development with frequent breaking changes. streamui tracks upstream and may also have breaking changes.

## Conventions

- ESM only (tsup builds to ESM with .d.ts)
- Spec updates are immutable (clone before mutate)
- Test files: `*.test.ts` colocated with source
- Unused args prefixed with `_` (`argsIgnorePattern: "^_"`)
