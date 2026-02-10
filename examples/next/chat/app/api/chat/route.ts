import { streamText, UIMessage } from "ai";
import {
  convertUIMessagesToModelMessages,
  type UIDataTypes,
} from "ai-streamui";
import { catalog } from "@/lib/catalog";

type ChatMessage = UIMessage<unknown, UIDataTypes>;

export async function POST(req: Request) {
  const { messages }: { messages: ChatMessage[] } = await req.json();

  const modelMessages = await convertUIMessagesToModelMessages(messages);

  const result = streamText({
    model: "anthropic/claude-sonnet-4.5",
    system: catalog.prompt(),
    messages: modelMessages,
  });

  return result.toUIMessageStreamResponse();
}
