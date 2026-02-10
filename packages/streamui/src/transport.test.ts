import { describe, it, expect, vi } from "vitest";
import { UITransport } from "./transport";
import type { UIMessageChunk } from "ai";
import type { UIDataTypes } from "./types";

// Helper to create a mock fetch response with streaming body
function createMockStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(encoder.encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

// Helper to collect all chunks from a stream
async function collectChunks(
  stream: ReadableStream<UIMessageChunk<unknown, UIDataTypes>>,
): Promise<UIMessageChunk<unknown, UIDataTypes>[]> {
  const reader = stream.getReader();
  const chunks: UIMessageChunk<unknown, UIDataTypes>[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return chunks;
}

describe("UITransport", () => {
  describe("streaming patches", () => {
    it("emits data-ui for each patch", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"card1\\"}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/card1\\",\\"value\\":{\\"type\\":\\"Card\\",\\"props\\":{}}}\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
              'data: {"type":"message-end"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      // Should have: message-start, data-ui (set root), data-ui (add element), text-end, message-end
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");
      expect(dataUIChunks).toHaveLength(2);

      // First data-ui: root set
      expect((dataUIChunks[0] as { data: unknown }).data).toEqual({
        root: "card1",
        elements: {},
      });

      // Second data-ui: element added
      expect((dataUIChunks[1] as { data: unknown }).data).toEqual({
        root: "card1",
        elements: {
          card1: { type: "Card", props: {} },
        },
      });
    });

    it("handles patches split across chunks", async () => {
      const transport = new UITransport({
        fetch: vi.fn().mockResolvedValue(
          createMockStreamResponse([
            'data: {"type":"message-start","id":"msg1"}\n',
            // Patch split across multiple text-delta chunks
            'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\","}\n',
            'data: {"type":"text-delta","id":"text1","delta":"\\"path\\":\\"/root\\","}\n',
            'data: {"type":"text-delta","id":"text1","delta":"\\"value\\":\\"card1\\"}\\n"}\n',
            'data: {"type":"text-end","id":"text1"}\n',
          ]),
        ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      expect(dataUIChunks).toHaveLength(1);
      expect((dataUIChunks[0] as { data: unknown }).data).toEqual({
        root: "card1",
        elements: {},
      });
    });
  });

  describe("streaming text", () => {
    it("emits data-ui-text for non-patch content", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Hello "}\n',
              'data: {"type":"text-delta","id":"text1","delta":"world!\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const textChunks = chunks.filter((c) => c.type === "data-ui-text");

      // Text should be emitted
      expect(textChunks.length).toBeGreaterThan(0);
      const combinedText = textChunks
        .map((c) => (c as { data: { text: string } }).data?.text ?? "")
        .join("\n");
      expect(combinedText).toContain("Hello");
      expect(combinedText).toContain("world!");
    });

    it("updates data-ui-text incrementally before text-end", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"First line\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Second line\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Third line\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const textChunks = chunks.filter((c) => c.type === "data-ui-text");

      // data-ui-text updates should be emitted for each line
      expect(textChunks).toHaveLength(3);
      expect((textChunks[0] as { data: { text: string } }).data.text).toBe(
        "First line\n",
      );
      expect((textChunks[1] as { data: { text: string } }).data.text).toBe(
        "First line\nSecond line\n",
      );
      expect((textChunks[2] as { data: { text: string } }).data.text).toBe(
        "First line\nSecond line\nThird line\n",
      );
    });

    it("preserves original whitespace in text", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"  indented\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"    more indent\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const finalText = (
        textChunks[textChunks.length - 1] as { data: { text: string } }
      ).data.text;

      // Whitespace should be preserved
      expect(finalText).toBe("  indented\n    more indent\n");
    });

    it("does not add extra newlines to text output", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Line one\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Line two\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const combinedText = (
        textChunks[textChunks.length - 1] as { data: { text: string } }
      ).data.text;

      // Should not have extra newlines added by the transport
      expect(combinedText).toBe("Line one\nLine two\n");
    });

    it("handles text without trailing newline", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"No newline at end"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const combinedText = (
        textChunks[textChunks.length - 1] as { data: { text: string } }
      ).data.text;

      // Should preserve the original text without adding newlines
      expect(combinedText).toBe("No newline at end");
    });

    it("handles mixed text and patches", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Here is a card:\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"card1\\"}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/card1\\",\\"value\\":{\\"type\\":\\"Card\\",\\"props\\":{}}}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Done!\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      // Should have both text and UI chunks
      expect(textChunks.length).toBeGreaterThan(0);
      expect(dataUIChunks).toHaveLength(2);

      // Text should contain the non-patch content
      const combinedText = textChunks
        .map((c) => (c as { data: { text: string } }).data?.text ?? "")
        .join("\n");
      expect(combinedText).toContain("Here is a card:");
      expect(combinedText).toContain("Done!");
    });
  });

  describe("response patterns", () => {
    it("handles UI-only response (no text)", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"card1\\"}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/card1\\",\\"value\\":{\\"type\\":\\"Card\\",\\"props\\":{\\"title\\":\\"Hello\\"},\\"children\\":[\\"text1\\"]}}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/text1\\",\\"value\\":{\\"type\\":\\"Text\\",\\"props\\":{\\"content\\":\\"World\\"}}}\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
              'data: {"type":"message-end"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      // Should have only UI chunks, no text
      expect(textChunks).toHaveLength(0);
      expect(dataUIChunks).toHaveLength(3);

      // Final UI state should have nested structure
      const finalUI = (dataUIChunks[2] as { data: unknown }).data as {
        root: string;
        elements: Record<string, unknown>;
      };
      expect(finalUI.root).toBe("card1");
      expect(Object.keys(finalUI.elements)).toHaveLength(2);
      expect(finalUI.elements["card1"]).toEqual({
        type: "Card",
        props: { title: "Hello" },
        children: ["text1"],
      });
      expect(finalUI.elements["text1"]).toEqual({
        type: "Text",
        props: { content: "World" },
      });
    });

    it("handles text-only response (no UI)", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"This is a plain text response.\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"It has multiple lines.\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"No UI components here."}\n',
              'data: {"type":"text-end","id":"text1"}\n',
              'data: {"type":"message-end"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      // Should have only text chunks, no UI
      expect(dataUIChunks).toHaveLength(0);
      expect(textChunks).toHaveLength(3);

      const combinedText = (
        textChunks[textChunks.length - 1] as { data: { text: string } }
      ).data.text;
      expect(combinedText).toBe(
        "This is a plain text response.\nIt has multiple lines.\nNo UI components here.",
      );
    });

    it("handles mixed response with text before, between, and after UI", async () => {
      const transport = new UITransport({
        fetch: vi.fn().mockResolvedValue(
          createMockStreamResponse([
            'data: {"type":"message-start","id":"msg1"}\n',
            // Text before UI
            'data: {"type":"text-delta","id":"text1","delta":"Here is a weather card:\\n"}\n',
            // UI patches
            'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"weather\\"}\\n"}\n',
            'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/weather\\",\\"value\\":{\\"type\\":\\"WeatherCard\\",\\"props\\":{\\"temp\\":22}}}\\n"}\n',
            // Text between
            'data: {"type":"text-delta","id":"text1","delta":"And here is a stock card:\\n"}\n',
            // More UI patches
            'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"stock\\"}\\n"}\n',
            'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/stock\\",\\"value\\":{\\"type\\":\\"StockCard\\",\\"props\\":{\\"symbol\\":\\"AAPL\\"}}}\\n"}\n',
            // Text after
            'data: {"type":"text-delta","id":"text1","delta":"That is all for now!\\n"}\n',
            'data: {"type":"text-end","id":"text1"}\n',
            'data: {"type":"message-end"}\n',
          ]),
        ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      const textChunks = chunks.filter((c) => c.type === "data-ui-text");
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      // Should have both text and UI chunks
      expect(textChunks.length).toBeGreaterThanOrEqual(3);
      expect(dataUIChunks).toHaveLength(4);

      // Verify final segmented text content
      const segmentTexts = [
        ...new Set(textChunks.map((c) => (c as { id: string }).id)),
      ].map((id) => {
        const last = textChunks
          .filter((c) => (c as { id: string }).id === id)
          .at(-1) as { data: { text: string } } | undefined;
        return last?.data.text ?? "";
      });
      expect(segmentTexts).toEqual([
        "Here is a weather card:\n",
        "And here is a stock card:\n",
        "That is all for now!\n",
      ]);

      // Verify chunk order (text → UI → text → UI → text)
      const chunkTypes = chunks
        .filter((c) => c.type === "data-ui-text" || c.type === "data-ui")
        .map((c) => c.type);
      expect(chunkTypes).toContain("data-ui-text");
      expect(chunkTypes).toContain("data-ui");

      // Verify final UI state
      const finalUI = (dataUIChunks[3] as { data: unknown }).data as {
        root: string;
        elements: Record<string, unknown>;
      };
      expect(finalUI.root).toBe("stock");
      expect(finalUI.elements["weather"]).toEqual({
        type: "WeatherCard",
        props: { temp: 22 },
      });
      expect(finalUI.elements["stock"]).toEqual({
        type: "StockCard",
        props: { symbol: "AAPL" },
      });
    });
  });

  describe("state patches", () => {
    it("includes state in data-ui when stream contains state patches", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/root\\",\\"value\\":\\"list\\"}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/list\\",\\"value\\":{\\"type\\":\\"Stack\\",\\"props\\":{},\\"repeat\\":{\\"path\\":\\"/items\\",\\"key\\":\\"id\\"},\\"children\\":[\\"card\\"]}}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/elements/card\\",\\"value\\":{\\"type\\":\\"Card\\",\\"props\\":{\\"title\\":{\\"$path\\":\\"$item/name\\"}},\\"children\\":[]}}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/state/items\\",\\"value\\":[]}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/state/items/0\\",\\"value\\":{\\"id\\":\\"a\\",\\"name\\":\\"First\\"}}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"add\\",\\"path\\":\\"/state/items/1\\",\\"value\\":{\\"id\\":\\"b\\",\\"name\\":\\"Second\\"}}\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);
      const dataUIChunks = chunks.filter((c) => c.type === "data-ui");

      // Each patch emits a data-ui chunk
      expect(dataUIChunks.length).toBe(6);

      // Final data-ui should contain state with items array
      const finalSpec = (dataUIChunks[5] as { data: unknown }).data as {
        root: string;
        elements: Record<string, unknown>;
        state: { items: Array<{ id: string; name: string }> };
      };

      expect(finalSpec.root).toBe("list");
      expect(finalSpec.state).toBeDefined();
      expect(finalSpec.state.items).toHaveLength(2);
      expect(finalSpec.state.items[0]).toEqual({ id: "a", name: "First" });
      expect(finalSpec.state.items[1]).toEqual({ id: "b", name: "Second" });

      // Elements should have repeat config
      expect(finalSpec.elements["list"]).toEqual({
        type: "Stack",
        props: {},
        repeat: { path: "/items", key: "id" },
        children: ["card"],
      });
    });
  });

  describe("pass-through chunks", () => {
    it("passes through non-text chunks unchanged", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"reasoning-delta","id":"reason1","delta":"thinking..."}\n',
              'data: {"type":"message-end"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });

      const chunks = await collectChunks(stream);

      expect(chunks).toContainEqual({ type: "message-start", id: "msg1" });
      expect(chunks).toContainEqual({
        type: "reasoning-delta",
        id: "reason1",
        delta: "thinking...",
      });
      expect(chunks).toContainEqual({ type: "message-end" });
    });
  });

  describe("ui-text segment ids", () => {
    it("creates new data-ui-text segment after patch boundary", async () => {
      const transport = new UITransport({
        fetch: vi
          .fn()
          .mockResolvedValue(
            createMockStreamResponse([
              'data: {"type":"message-start","id":"msg1"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"Before\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"{\\"op\\":\\"replace\\",\\"path\\":\\"/root\\",\\"value\\":\\"card1\\"}\\n"}\n',
              'data: {"type":"text-delta","id":"text1","delta":"After\\n"}\n',
              'data: {"type":"text-end","id":"text1"}\n',
            ]),
          ),
      });

      const stream = await transport.sendMessages({
        trigger: "submit-message",
        chatId: "chat1",
        messageId: undefined,
        messages: [],
        abortSignal: undefined,
      });
      const chunks = await collectChunks(stream);

      const uiText = chunks.filter((c) => c.type === "data-ui-text") as Array<{
        id: string;
        data: { segmentId: string; text: string };
      }>;
      const ids = [...new Set(uiText.map((c) => c.id))];
      expect(ids).toEqual(["ui-text-0", "ui-text-1"]);

      const firstSegmentFinal = uiText
        .filter((c) => c.id === "ui-text-0")
        .at(-1)?.data.text;
      const secondSegmentFinal = uiText
        .filter((c) => c.id === "ui-text-1")
        .at(-1)?.data.text;
      expect(firstSegmentFinal).toBe("Before\n");
      expect(secondSegmentFinal).toBe("After\n");
    });
  });
});
