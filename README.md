# StreamUI Chat

Streaming UI from AI in chat. A Transport implementation for [AI SDK](https://github.com/vercel/ai) that enables [json-render](https://github.com/nicholasgriffintn/json-render) UI streaming in `useChat`.

## Features

- **Streaming UI** - UI components render incrementally as the LLM generates them
- **Mixed responses** - Support both text and UI in the same message
- **AI SDK integration** - Works with useChat out of the box
- **Schema/Catalog** - Define your component catalog with Zod and auto-generate AI system prompts
- **Minimal** - Just a transport layer, easy to integrate

## Installation

```bash
npm install ai-streamui @json-render/react ai @ai-sdk/react
```

> `@json-render/core` is included as a dependency of ai-streamui — no need to install it separately.

## Quick Start

### 1. Define your component catalog

```typescript
// lib/catalog.ts
import { createCatalog, defaultSchema } from "ai-streamui";
import { z } from "zod";

export const catalog = createCatalog(defaultSchema, {
  components: {
    Card: {
      props: z.object({ title: z.string().optional() }),
      slots: ["default"],
      description: "Container with optional title",
    },
    Button: {
      props: z.object({ label: z.string() }),
      slots: [],
      description: "Clickable button",
    },
  },
  actions: {},
});
```

### 2. Use catalog.prompt() on the server

```typescript
import { streamText } from "ai";
import { convertUIMessagesToModelMessages } from "ai-streamui";
import { catalog } from "@/lib/catalog";

const modelMessages = await convertUIMessagesToModelMessages(messages);
const result = streamText({
  model,
  system: catalog.prompt(),
  messages: modelMessages,
});
return result.toUIMessageStreamResponse();
```

### 3. Use UITransport with useChat

```tsx
import { useChat, type UIMessage } from "@ai-sdk/react";
import { UITransport, type UIDataTypes } from "ai-streamui";

type ChatMessage = UIMessage<unknown, UIDataTypes>;

const { messages } = useChat<ChatMessage>({
  transport: new UITransport(),
});
```

### 4. Render UI parts with json-render

```tsx
import { Renderer } from "@json-render/react";
import type { Spec } from "ai-streamui";

{
  messages.map((message) =>
    message.parts.map((part, i) => {
      if (part.type === "data-ui") {
        return (
          <Renderer key={i} spec={part.data as Spec} registry={registry} />
        );
      }

      if (part.type === "data-ui-text") {
        return <p key={i}>{(part.data as { text?: string })?.text ?? ""}</p>;
      }

      return null;
    }),
  );
}
```

See [examples/next/chat](examples/next/chat) for a complete implementation.

> **Note:** `@json-render/core` is in early development and breaking changes are frequent. As a result, streamui may also introduce breaking changes to track upstream updates.

## How It Works

1. LLM generates text containing JSONL patches (one patch per line)
2. Server streams response via `toUIMessageStreamResponse()`
3. `UITransport` extracts patches from `text-delta` chunks (SpecStream)
4. Valid patches (`{ op, path, value }`) are applied to build a `Spec`
5. Each patch emits a `data-ui` chunk with the updated Spec
6. Non-patch text is emitted as `data-ui-text` chunks (segmented by patch boundaries)
7. `useChat` accumulates chunks into `message.parts`
8. Render `data-ui` via `Renderer` and `data-ui-text` as normal text

> Note: When using `UITransport`, assistant non-patch text is surfaced as `data-ui-text` parts (not standard `text` parts).

## Development

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Run example app
bun run --filter=chat dev
```

## License

MIT
