"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  Renderer,
  StateProvider,
  VisibilityProvider,
  ActionProvider,
} from "@json-render/react";
import { UITransport, type UIDataTypes, type Spec } from "ai-streamui";
import { registry } from "@/components/registry";

type ChatMessage = UIMessage<unknown, UIDataTypes>;

export default function ChatPage() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat<ChatMessage>({
    transport: new UITransport(),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header className="border-b border-border p-4">
        <h1 className="text-center text-xl font-bold">StreamUI Chat</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        <div
          className="mx-auto max-w-2xl space-y-4"
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <p className="text-center text-muted-foreground">
              No messages yet. Start a conversation!
            </p>
          )}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-lg p-4 ${
                message.role === "user" ? "bg-muted" : "bg-secondary"
              }`}
            >
              <div className="mb-2 text-sm font-semibold capitalize text-muted-foreground">
                {message.role}
              </div>
              <div className="space-y-3">
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case "text":
                      return (
                        <p key={i} className="text-foreground">
                          {part.text}
                        </p>
                      );
                    // UITransport emits non-patch assistant text as a custom data part.
                    case "data-ui-text":
                      return (
                        <p
                          key={i}
                          className="whitespace-pre-wrap text-foreground"
                        >
                          {(part.data as { text?: string })?.text ?? ""}
                        </p>
                      );
                    case "data-ui": {
                      const spec = part.data as Spec & {
                        state?: Record<string, unknown>;
                      };
                      return (
                        <div key={i}>
                          <StateProvider initialState={spec.state}>
                            <VisibilityProvider>
                              <ActionProvider handlers={{}}>
                                <Renderer
                                  spec={spec}
                                  registry={registry}
                                  loading={isLoading}
                                />
                              </ActionProvider>
                            </VisibilityProvider>
                          </StateProvider>
                        </div>
                      );
                    }
                    default:
                      return null;
                  }
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t border-border p-4">
        <form className="mx-auto flex max-w-2xl gap-3" onSubmit={handleSubmit}>
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <input
            id="chat-input"
            name="message"
            className="flex-1 rounded-lg border border-input bg-background text-foreground px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything..."
            autoComplete="off"
            disabled={isLoading}
          />
          <button
            className="rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={isLoading}
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
