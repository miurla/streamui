import type { UIMessage, ModelMessage } from "ai";
import { convertToModelMessages } from "ai";
import type { Spec } from "@json-render/core";
import type { UIDataTypes } from "./types";

/**
 * Serialize a Spec as compact JSON for model context.
 * Avoids format conversion to keep model output aligned with JSON/patch generation.
 */
function serializeSpec(spec: Spec): string {
  return JSON.stringify(spec);
}

/**
 * Convert UI messages to model messages.
 * Automatically converts data-ui parts to text descriptions for LLM context.
 *
 * @example
 * ```ts
 * const modelMessages = await convertUIMessagesToModelMessages(messages);
 * const result = streamText({ model, messages: modelMessages });
 * ```
 */
export async function convertUIMessagesToModelMessages(
  messages: UIMessage<unknown, UIDataTypes>[],
): Promise<ModelMessage[]> {
  return convertToModelMessages(messages, {
    convertDataPart: (part) => {
      if (part.type === "data-ui-text" && part.data) {
        const text = (part.data as { text?: string }).text;
        if (typeof text === "string" && text.length > 0) {
          return { type: "text", text };
        }
      }

      if (part.id === "ui" && part.data) {
        const specJson = serializeSpec(part.data as Spec);
        return { type: "text", text: `[Generated UI Spec JSON]\n${specJson}` };
      }
      return undefined;
    },
  });
}
