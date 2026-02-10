import { describe, it, expect } from "vitest";
import { SpecStreamBuffer, applySpecPatch, buildSpec } from "./spec-stream";
import type { Spec } from "@json-render/core";

describe("SpecStreamBuffer", () => {
  describe("processChunk", () => {
    it("parses complete JSONL patch", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk(
        '{"op":"replace","path":"/root","value":"card1"}\n',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "patch",
        data: { op: "replace", path: "/root", value: "card1" },
      });
    });

    it("parses multiple patches in one chunk", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk(
        '{"op":"replace","path":"/root","value":"card1"}\n{"op":"add","path":"/elements/card1","value":{}}\n',
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.type).toBe("patch");
      expect(result[1]?.type).toBe("patch");
    });

    it("buffers incomplete line across chunks", () => {
      const buffer = new SpecStreamBuffer();

      // First chunk: incomplete JSON
      const result1 = buffer.processChunk('{"op":"replace","path":"/ro');
      expect(result1).toHaveLength(0);

      // Second chunk: completes the JSON
      const result2 = buffer.processChunk('ot","value":"card1"}\n');
      expect(result2).toHaveLength(1);
      expect(result2[0]).toEqual({
        type: "patch",
        data: { op: "replace", path: "/root", value: "card1" },
      });
    });

    it("treats non-JSON line as text", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk("Hello, this is plain text\n");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "text",
        content: "Hello, this is plain text",
      });
    });

    it("treats JSON without op/path as text", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk('{"message":"hello"}\n');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "text",
        content: '{"message":"hello"}',
      });
    });

    it("handles mixed patches and text", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk(
        'Some text before\n{"op":"replace","path":"/root","value":"x"}\nSome text after\n',
      );

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ type: "text", content: "Some text before" });
      expect(result[1]?.type).toBe("patch");
      expect(result[2]).toEqual({ type: "text", content: "Some text after" });
    });

    it("skips empty lines", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk(
        '\n\n{"op":"replace","path":"/root","value":"x"}\n\n',
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.type).toBe("patch");
    });

    it("preserves leading whitespace in text", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk("  indented text\n");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "text",
        content: "  indented text",
      });
    });

    it("preserves trailing whitespace in text", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.processChunk("text with trailing  \n");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        type: "text",
        content: "text with trailing  ",
      });
    });
  });

  describe("flush", () => {
    it("returns buffered content on flush", () => {
      const buffer = new SpecStreamBuffer();
      buffer.processChunk('{"op":"replace","path":"/root","value":"card1"}');
      // No newline, so it's buffered

      const result = buffer.flush();
      expect(result).toEqual({
        type: "patch",
        data: { op: "replace", path: "/root", value: "card1" },
      });
    });

    it("returns null when buffer is empty", () => {
      const buffer = new SpecStreamBuffer();
      const result = buffer.flush();
      expect(result).toBeNull();
    });

    it("returns null when buffer is only whitespace", () => {
      const buffer = new SpecStreamBuffer();
      buffer.processChunk("   ");
      const result = buffer.flush();
      expect(result).toBeNull();
    });

    it("clears buffer after flush", () => {
      const buffer = new SpecStreamBuffer();
      buffer.processChunk("test content");
      buffer.flush();
      const result = buffer.flush();
      expect(result).toBeNull();
    });
  });
});

describe("applySpecPatch", () => {
  it("sets root", () => {
    const spec: Spec = { root: "", elements: {} };
    const result = applySpecPatch(spec, {
      op: "replace",
      path: "/root",
      value: "card1",
    });

    expect(result.root).toBe("card1");
  });

  it("adds element", () => {
    const spec: Spec = { root: "card1", elements: {} };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/elements/card1",
      value: {
        type: "Card",
        props: { title: "Hello" },
        children: [],
      },
    });

    expect(result.elements["card1"]).toEqual({
      type: "Card",
      props: { title: "Hello" },
      children: [],
    });
  });

  it("updates existing element", () => {
    const spec: Spec = {
      root: "card1",
      elements: {
        card1: { type: "Card", props: { title: "Old" } },
      },
    };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/elements/card1",
      value: {
        type: "Card",
        props: { title: "New" },
      },
    });

    expect(result.elements["card1"]?.props?.title).toBe("New");
  });

  it("removes element", () => {
    const spec: Spec = {
      root: "card1",
      elements: {
        card1: { type: "Card", props: {} },
      },
    };
    const result = applySpecPatch(spec, {
      op: "remove",
      path: "/elements/card1",
    });

    expect(result.elements["card1"]).toBeUndefined();
  });

  it("preserves immutability", () => {
    const spec: Spec = {
      root: "",
      elements: {
        card1: { type: "Card", props: {} },
      },
    };
    const result = applySpecPatch(spec, {
      op: "replace",
      path: "/root",
      value: "card1",
    });

    expect(result).not.toBe(spec);
    expect(result.elements).not.toBe(spec.elements);
  });

  it("handles complex element with children", () => {
    const spec: Spec = { root: "", elements: {} };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/elements/stack1",
      value: {
        type: "Stack",
        props: {},
        children: ["card1", "card2"],
      },
    });

    expect(result.elements["stack1"]?.children).toEqual(["card1", "card2"]);
  });

  it("updates nested element path using JSON pointer semantics", () => {
    const spec: Spec = {
      root: "card1",
      elements: {
        card1: { type: "Card", props: { title: "Old" } },
      },
    };

    const result = applySpecPatch(spec, {
      op: "replace",
      path: "/elements/card1/props/title",
      value: "New",
    });

    expect(result.elements["card1"]?.props?.title).toBe("New");
    expect(
      (result.elements as Record<string, unknown>)["card1/props/title"],
    ).toBeUndefined();
    expect(spec.elements["card1"]?.props?.title).toBe("Old");
  });

  it("adds element with on event binding", () => {
    const spec: Spec = { root: "btn1", elements: {} };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/elements/btn1",
      value: {
        type: "Button",
        props: { label: "Save" },
        children: [],
        on: {
          press: {
            action: "setState",
            params: { path: "/saved", value: true },
          },
        },
      },
    });

    expect(result.elements["btn1"]?.on).toEqual({
      press: {
        action: "setState",
        params: { path: "/saved", value: true },
      },
    });
  });

  it("adds element with repeat field", () => {
    const spec: Spec = { root: "list", elements: {} };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/elements/list",
      value: {
        type: "Column",
        props: {},
        children: ["item"],
        repeat: { path: "/todos", key: "id" },
      },
    });

    expect(result.elements["list"]?.repeat).toEqual({
      path: "/todos",
      key: "id",
    });
  });

  it("applies state patch", () => {
    const spec: Spec = { root: "card1", elements: {} };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/state",
      value: { count: 0, items: [] },
    });

    expect(result.state).toEqual({ count: 0, items: [] });
  });

  it("applies nested state patch", () => {
    const spec: Spec = {
      root: "card1",
      elements: {},
      state: { items: [] },
    };
    const result = applySpecPatch(spec, {
      op: "add",
      path: "/state/items/0",
      value: { id: "1", title: "First" },
    });

    expect((result.state as { items: unknown[] }).items[0]).toEqual({
      id: "1",
      title: "First",
    });
  });
});

describe("buildSpec", () => {
  it("builds spec from patches", () => {
    const result = buildSpec([
      { op: "replace", path: "/root", value: "card1" },
      {
        op: "add",
        path: "/elements/card1",
        value: { type: "Card", props: { title: "Hello" } },
      },
    ]);

    expect(result.root).toBe("card1");
    expect(result.elements["card1"]).toEqual({
      type: "Card",
      props: { title: "Hello" },
    });
  });

  it("auto-infers root from first element if not set", () => {
    const result = buildSpec([
      {
        op: "add",
        path: "/elements/card1",
        value: { type: "Card", props: {} },
      },
    ]);

    expect(result.root).toBe("card1");
  });

  it("returns empty spec for empty patches", () => {
    const result = buildSpec([]);

    expect(result.root).toBe("");
    expect(result.elements).toEqual({});
  });

  it("builds spec with repeat, state, and $path references", () => {
    const result = buildSpec([
      { op: "add", path: "/root", value: "list" },
      {
        op: "add",
        path: "/elements/list",
        value: {
          type: "Stack",
          props: {},
          repeat: { path: "/items", key: "id" },
          children: ["item-card"],
        },
      },
      {
        op: "add",
        path: "/elements/item-card",
        value: {
          type: "Card",
          props: { title: { $path: "$item/name" } },
          children: [],
        },
      },
      { op: "add", path: "/state/items", value: [] },
      {
        op: "add",
        path: "/state/items/0",
        value: { id: "a", name: "First" },
      },
      {
        op: "add",
        path: "/state/items/1",
        value: { id: "b", name: "Second" },
      },
    ]);

    expect(result.root).toBe("list");

    // Elements are correctly built
    expect(result.elements["list"]?.repeat).toEqual({
      path: "/items",
      key: "id",
    });
    expect(result.elements["item-card"]?.props).toEqual({
      title: { $path: "$item/name" },
    });

    // State is populated with array data for repeat to iterate
    const state = result.state as {
      items: Array<{ id: string; name: string }>;
    };
    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toEqual({ id: "a", name: "First" });
    expect(state.items[1]).toEqual({ id: "b", name: "Second" });
  });
});
