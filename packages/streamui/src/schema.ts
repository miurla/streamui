import {
  defineSchema,
  defineCatalog,
  buildUserPrompt,
  type Schema,
  type SchemaDefinition,
  type Catalog,
  type InferCatalogInput,
  type PromptOptions,
  type UserPromptOptions,
} from "@json-render/core";

/**
 * Default schema for streamui - Element Tree format.
 *
 * Defines the Spec shape (what AI generates) and the Catalog shape
 * (what components provide). Compatible with @json-render/react's Renderer.
 *
 * Spec structure:
 * ```json
 * {
 *   "root": "card-1",
 *   "state": { "count": 0 },
 *   "elements": {
 *     "card-1": { "type": "Card", "props": {...}, "children": [...], "on": {...}, "repeat": {...} }
 *   }
 * }
 * ```
 */
export const defaultSchema = defineSchema((s) => ({
  spec: s.object({
    root: s.string(),
    elements: s.record(
      s.object({
        type: s.ref("catalog.components"),
        props: s.propsOf("catalog.components"),
        children: s.array(s.string()),
        visible: s.any(),
        on: s.any(),
        repeat: s.any(),
      }),
    ),
    state: s.any(),
  }),
  catalog: s.object({
    components: s.map({
      props: s.zod(),
      slots: s.array(s.string()),
      description: s.string(),
    }),
    actions: s.map({
      params: s.zod(),
      description: s.string(),
    }),
  }),
}));

/**
 * Create a catalog from a schema and component/action definitions.
 *
 * @example
 * ```typescript
 * import { createCatalog, defaultSchema } from 'streamui';
 * import { z } from 'zod';
 *
 * const catalog = createCatalog(defaultSchema, {
 *   components: {
 *     Card: {
 *       props: z.object({ title: z.string().optional() }),
 *       slots: ['default'],
 *       description: 'Container with optional title',
 *     },
 *     Button: {
 *       props: z.object({ label: z.string() }),
 *       slots: [],
 *       description: 'Clickable button',
 *     },
 *   },
 * });
 *
 * // Generate system prompt for AI
 * const prompt = catalog.prompt();
 *
 * // Validate AI output
 * const result = catalog.validate(spec);
 * ```
 */
/**
 * Default rules injected into prompt() for streamui.
 * These ensure the LLM outputs raw JSONL compatible with UITransport.
 */
const STREAMUI_RULES: string[] = [
  "Never wrap output in code fences (``` or ```json). Output raw JSONL lines directly.",
  "You may include plain text lines before, after, or between JSONL patch lines.",
];

export function createCatalog<
  TDef extends SchemaDefinition,
  TCatalog extends InferCatalogInput<TDef["catalog"]>,
>(schema: Schema<TDef>, catalog: TCatalog): Catalog<TDef, TCatalog> {
  const base = defineCatalog(schema, catalog);
  const originalPrompt = base.prompt.bind(base);

  base.prompt = (options?: PromptOptions): string => {
    return originalPrompt({
      ...options,
      customRules: [...STREAMUI_RULES, ...(options?.customRules ?? [])],
    });
  };

  return base;
}

/**
 * Build a user prompt with streamui-specific rules appended.
 * Wraps `@json-render/core`'s `buildUserPrompt` and adds transport
 * instructions (no code fences, raw JSONL output).
 */
export function createUserPrompt(options: UserPromptOptions): string {
  const base = buildUserPrompt(options);
  return base + "\n\n" + STREAMUI_RULES.join("\n");
}
