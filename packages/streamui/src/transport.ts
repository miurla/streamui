import type {
  ChatTransport,
  UIMessage,
  ChatRequestOptions,
  UIMessageChunk,
} from "ai";
import type { Spec } from "@json-render/core";
import { SpecStreamBuffer, applySpecPatch } from "./spec-stream";
import type { SpecPatch, UIDataTypes } from "./types";

/**
 * Options for UITransport.
 */
export interface UITransportOptions {
  /** API endpoint URL. Defaults to '/api/chat'. */
  api?: string;
  /** Additional headers for requests. */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>);
  /** Additional body properties for requests. */
  body?: Record<string, unknown>;
  /** Request credentials mode. */
  credentials?: RequestCredentials;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
}

/**
 * UITransport - Custom ChatTransport for streaming UI with SpecStream patches.
 *
 * Extends DefaultChatTransport behavior:
 * - Parses UIMessageStream (JSON event stream)
 * - Extracts SpecStream patches from text-delta chunks
 * - Builds Spec incrementally and emits `data-ui` chunks
 * - Passes through all other chunk types (tool, reasoning, etc.)
 */
export class UITransport<
  UI_MESSAGE extends UIMessage = UIMessage,
> implements ChatTransport<UI_MESSAGE> {
  private api: string;
  private headers?: UITransportOptions["headers"];
  private body?: Record<string, unknown>;
  private credentials?: RequestCredentials;
  private customFetch?: typeof fetch;

  constructor(options: UITransportOptions = {}) {
    this.api = options.api ?? "/api/chat";
    this.headers = options.headers;
    this.body = options.body;
    this.credentials = options.credentials;
    this.customFetch = options.fetch;
  }

  async sendMessages(
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: UI_MESSAGE[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk<unknown, UIDataTypes>>> {
    const resolvedHeaders =
      typeof this.headers === "function" ? await this.headers() : this.headers;

    const optionHeaders =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : (options.headers ?? {});

    const fetchFn = this.customFetch ?? globalThis.fetch;

    const response = await fetchFn(this.api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...resolvedHeaders,
        ...optionHeaders,
      },
      body: JSON.stringify({
        ...this.body,
        ...options.body,
        id: options.chatId,
        messages: options.messages,
        trigger: options.trigger,
        messageId: options.messageId,
      }),
      credentials: this.credentials,
      signal: options.abortSignal,
    });

    if (!response.ok) {
      throw new Error(
        (await response.text()) || "Failed to fetch the chat response.",
      );
    }

    if (!response.body) {
      throw new Error("The response body is empty.");
    }

    return this.processResponseStream(response.body);
  }

  /**
   * Reconnect to an existing stream is not supported.
   */
  async reconnectToStream(
    _options: { chatId: string } & ChatRequestOptions,
  ): Promise<ReadableStream<UIMessageChunk<unknown, UIDataTypes>> | null> {
    return null;
  }

  /**
   * Process the UIMessageStream response:
   * - Parse JSON event stream (same format as DefaultChatTransport)
   * - Extract SpecStream patches from text-delta chunks
   * - Build Spec incrementally and emit data-ui chunks
   * - Pass through all other chunk types unchanged
   */
  private processResponseStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<UIMessageChunk<unknown, UIDataTypes>> {
    const specBuffer = new SpecStreamBuffer();
    let currentSpec: Spec = { root: "", elements: {} };
    let segmentIndex = 0;
    let currentSegmentText = "";

    const textDecoder = new TextDecoder();

    return new ReadableStream<UIMessageChunk<unknown, UIDataTypes>>({
      async start(controller) {
        const reader = stream.getReader();
        let buffer = "";
        const emitUIText = (text: string) => {
          currentSegmentText += text;
          controller.enqueue({
            type: "data-ui-text",
            id: `ui-text-${segmentIndex}`,
            data: {
              segmentId: `seg-${segmentIndex}`,
              text: currentSegmentText,
            },
          });
        };

        const splitTextSegment = () => {
          if (!currentSegmentText) return;
          segmentIndex += 1;
          currentSegmentText = "";
        };

        const processLine = (line: string) => {
          if (!line.trim()) return;

          // Handle SSE format (data:{...} or data: {...}) or raw JSON
          let jsonLine = line.trim();
          if (jsonLine.startsWith("data:")) {
            jsonLine = jsonLine.slice(5).trimStart();
          }
          if (jsonLine === "[DONE]") return;

          try {
            const chunk = JSON.parse(jsonLine) as UIMessageChunk<
              unknown,
              UIDataTypes
            >;

            // Handle text-delta: extract patches and convert text to data-ui-text
            if (chunk.type === "text-delta") {
              const parsed = specBuffer.processChunk(chunk.delta);

              for (const item of parsed) {
                if (item.type === "patch") {
                  splitTextSegment();
                  currentSpec = applySpecPatch(
                    currentSpec,
                    item.data as SpecPatch,
                  );
                  controller.enqueue({
                    type: "data-ui",
                    id: "ui",
                    data: currentSpec,
                  });
                } else {
                  // Keep newline to preserve streamed text formatting.
                  emitUIText(item.content + "\n");
                }
              }
            }
            // Handle text-end: flush remaining buffer content
            else if (chunk.type === "text-end") {
              const remaining = specBuffer.flush();
              if (remaining) {
                if (remaining.type === "patch") {
                  splitTextSegment();
                  currentSpec = applySpecPatch(
                    currentSpec,
                    remaining.data as SpecPatch,
                  );
                  controller.enqueue({
                    type: "data-ui",
                    id: "ui",
                    data: currentSpec,
                  });
                } else {
                  emitUIText(remaining.content);
                }
              }

              splitTextSegment();
            }
            // text-start is transport-internal for us; suppress it.
            else if (chunk.type === "text-start") {
              return;
            }
            // Pass through all other chunk types unchanged
            else {
              controller.enqueue(chunk);
            }
          } catch {
            // Skip invalid JSON lines
          }
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              buffer += textDecoder.decode();
              break;
            }

            buffer += textDecoder.decode(value, { stream: true });

            // Parse JSON events (newline-delimited JSON)
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              processLine(line);
            }
          }

          if (buffer.trim()) {
            processLine(buffer);
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}
