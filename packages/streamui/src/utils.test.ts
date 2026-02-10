import { describe, it, expect } from "vitest";
import { convertUIMessagesToModelMessages } from "./utils";
import type { UIMessage } from "ai";
import type { UIDataTypes } from "./types";

type ChatMessage = UIMessage<unknown, UIDataTypes>;

describe("convertUIMessagesToModelMessages", () => {
  it("converts user messages unchanged", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Hello" }],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("user");
  });

  it("converts data-ui parts to JSON spec text", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "data-ui",
            id: "ui",
            data: {
              root: "card1",
              elements: {
                card1: {
                  key: "card1",
                  type: "Card",
                  props: { title: "Welcome" },
                  children: ["text1"],
                },
                text1: {
                  key: "text1",
                  type: "Text",
                  props: { content: "Hello!" },
                },
              },
            },
          },
        ],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    expect(result).toHaveLength(1);
    expect(result[0]?.role).toBe("assistant");

    // Check that the content includes JSON spec
    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      const textPart = content.find((p) => p.type === "text");
      expect(textPart).toBeDefined();
      const text = (textPart as { text: string }).text;
      expect(text).toContain("[Generated UI Spec JSON]");
      expect(text).toContain('"root":"card1"');
      expect(text).toContain('"type":"Card"');
      expect(text).toContain('"type":"Text"');
    }
  });

  it("preserves text parts in assistant messages", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          { type: "text", text: "Here is your card:" },
          {
            type: "data-ui",
            id: "ui",
            data: {
              root: "card1",
              elements: {
                card1: { key: "card1", type: "Card", props: {} },
              },
            },
          },
        ],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      const textParts = content.filter((p) => p.type === "text");
      expect(textParts.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("converts data-ui-text parts to plain text for model input", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "data-ui-text",
            id: "ui-text-0",
            data: {
              segmentId: "seg-0",
              text: "Before UI",
            },
          },
          {
            type: "data-ui",
            id: "ui",
            data: {
              root: "card1",
              elements: {
                card1: { key: "card1", type: "Card", props: {} },
              },
            },
          },
          {
            type: "data-ui-text",
            id: "ui-text-1",
            data: {
              segmentId: "seg-1",
              text: "After UI",
            },
          },
        ],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      const textParts = content.filter((p) => p.type === "text") as Array<{
        type: "text";
        text: string;
      }>;
      expect(textParts.some((p) => p.text.includes("Before UI"))).toBe(true);
      expect(
        textParts.some((p) => p.text.includes("[Generated UI Spec JSON]")),
      ).toBe(true);
      expect(textParts.some((p) => p.text.includes("After UI"))).toBe(true);
    }
  });

  it("ignores data-ui parts with non-ui id", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          { type: "text", text: "Some text" },
          {
            type: "data-ui",
            id: "other",
            data: { something: "else" },
          },
        ],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      // Should only have the text part, not the other data
      const textParts = content.filter((p) => p.type === "text");
      expect(textParts).toHaveLength(1);
      expect((textParts[0] as { text: string }).text).toBe("Some text");
    }
  });

  it("handles empty spec", async () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "data-ui",
            id: "ui",
            data: {
              root: "",
              elements: {},
            },
          },
        ],
      },
    ];

    const result = await convertUIMessagesToModelMessages(messages);

    const content = result[0]?.content;
    expect(Array.isArray(content)).toBe(true);
    if (Array.isArray(content)) {
      const textPart = content.find((p) => p.type === "text");
      expect(textPart).toBeDefined();
      expect((textPart as { text: string }).text).toContain(
        '[Generated UI Spec JSON]\n{"root":"","elements":{}}',
      );
    }
  });
});
