import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createCatalog, createUserPrompt, defaultSchema } from "./schema";

describe("createCatalog", () => {
  const catalog = createCatalog(defaultSchema, {
    components: {
      Card: {
        props: z.object({ title: z.string().optional() }),
        slots: ["default"],
        description: "A card container",
      },
      Button: {
        props: z.object({ label: z.string() }),
        slots: [],
        description: "A clickable button",
      },
    },
    actions: {},
  });

  it("creates a catalog from defaultSchema", () => {
    expect(catalog).toBeDefined();
  });

  it("generates a system prompt with prompt()", () => {
    const prompt = catalog.prompt();

    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    // Should mention the component names
    expect(prompt).toContain("Card");
    expect(prompt).toContain("Button");
  });

  it("includes streamui rules in prompt (no code fences)", () => {
    const prompt = catalog.prompt();

    expect(prompt).toContain("code fences");
    expect(prompt).toContain("plain text");
  });

  it("preserves user customRules alongside streamui rules", () => {
    const prompt = catalog.prompt({ customRules: ["Always use dark theme"] });

    // streamui rules
    expect(prompt).toContain("code fences");
    // user rules
    expect(prompt).toContain("Always use dark theme");
  });

  it("validates a correct spec", () => {
    const spec = {
      root: "card-1",
      elements: {
        "card-1": {
          type: "Card",
          props: { title: "Hello" },
          children: ["btn-1"],
        },
        "btn-1": {
          type: "Button",
          props: { label: "Click me" },
          children: [],
        },
      },
    };

    const result = catalog.validate(spec);
    expect(result.success).toBe(true);
  });

  it("validates a spec with on, repeat, and state", () => {
    const spec = {
      root: "list",
      state: { items: [{ id: "1", label: "Item 1" }] },
      elements: {
        list: {
          type: "Card",
          props: {},
          children: ["item"],
          repeat: { path: "/items", key: "id" },
        },
        item: {
          type: "Button",
          props: { label: "Click" },
          children: [],
          on: {
            press: {
              action: "setState",
              params: { path: "/selected", value: true },
            },
          },
          visible: { path: "/showItems" },
        },
      },
    };

    const result = catalog.validate(spec);
    expect(result.success).toBe(true);
  });

  it("includes v0.5 features in prompt (on, repeat, state)", () => {
    const catalogWithActions = createCatalog(defaultSchema, {
      components: {
        Card: {
          props: z.object({ title: z.string().optional() }),
          slots: ["default"],
          description: "A card container",
        },
      },
      actions: {
        setState: {
          params: z.object({ path: z.string(), value: z.any() }),
          description: "Update state at path",
        },
      },
    });

    const prompt = catalogWithActions.prompt();

    expect(prompt).toContain("repeat");
    expect(prompt).toContain("$item");
    expect(prompt).toContain("state");
    expect(prompt).toContain("on");
  });

  it("rejects an invalid spec (missing root)", () => {
    const spec = {
      elements: {
        "card-1": {
          type: "Card",
          props: {},
          children: [],
        },
      },
    };

    const result = catalog.validate(spec as unknown);
    expect(result.success).toBe(false);
  });
});

describe("createUserPrompt", () => {
  it("builds a basic prompt with streamui rules", () => {
    const result = createUserPrompt({ prompt: "create a todo app" });

    expect(result).toContain("create a todo app");
    expect(result).toContain("code fences");
    expect(result).toContain("raw JSONL");
  });

  it("includes currentSpec for refinement mode", () => {
    const spec = {
      root: "card1",
      elements: {
        card1: { type: "Card", props: { title: "Hello" }, children: [] },
      },
    };

    const result = createUserPrompt({
      prompt: "add a toggle",
      currentSpec: spec,
    });

    expect(result).toContain("add a toggle");
    expect(result).toContain("card1");
    expect(result).toContain("code fences");
  });

  it("includes state context", () => {
    const result = createUserPrompt({
      prompt: "show my data",
      state: { todos: [{ id: "1", text: "Buy milk" }] },
    });

    expect(result).toContain("show my data");
    expect(result).toContain("todos");
    expect(result).toContain("code fences");
  });
});
