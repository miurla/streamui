# StreamUI Chat Example

A minimal chat application demonstrating streamui with Next.js, AI SDK, and `@json-render/react`.

## Setup

```bash
bun install
```

Set your API key in `.env.local`:

```
ANTHROPIC_API_KEY=sk-...
```

## Run

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

## Structure

- `lib/catalog.ts` - Component catalog definition (Text, Card, Stack, Button)
- `components/registry.tsx` - React component registry for `@json-render/react`
- `app/page.tsx` - Chat UI with `useChat` + `UITransport`
- `app/api/chat/route.ts` - Server route with `streamText` + `catalog.prompt()`
