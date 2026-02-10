import { createCatalog, defaultSchema } from "ai-streamui";
import { z } from "zod";

export const catalog = createCatalog(defaultSchema, {
  components: {
    Text: {
      props: z.object({
        content: z.string(),
      }),
      slots: [],
      description: "Display text content",
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
      }),
      slots: ["default"],
      description: "Container with optional title, supports children",
    },
    Stack: {
      props: z.object({}),
      slots: ["default"],
      description: "Vertical layout container, supports children",
    },
    Button: {
      props: z.object({
        label: z.string(),
      }),
      slots: [],
      description: "Clickable button",
    },
  },
  actions: {},
});
