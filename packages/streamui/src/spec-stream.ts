import {
  applySpecStreamPatch,
  type Spec,
  type SpecStreamLine,
} from "@json-render/core";
import type { ParsedLine, SpecPatch } from "./types";

// ---------------------------------------------------------------------------
// SpecStream Buffer - Parse streaming text into patches and text lines
// ---------------------------------------------------------------------------

/**
 * Parse a single line as either a spec patch or text.
 * Preserves original whitespace for text content.
 */
function parseSpecLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed.op && parsed.path) {
      return { type: "patch", data: parsed as SpecPatch };
    }
    // Valid JSON but not a patch - return original line content
    return { type: "text", content: line };
  } catch {
    // Not JSON - return original line content (preserving whitespace)
    return { type: "text", content: line };
  }
}

/**
 * Buffer for processing SpecStream content.
 * Handles incomplete lines across chunk boundaries.
 */
export class SpecStreamBuffer {
  private buffer = "";

  /**
   * Process a chunk of text and return parsed lines.
   * Incomplete lines are buffered for the next chunk.
   */
  processChunk(chunk: string): ParsedLine[] {
    this.buffer += chunk;

    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    const results: ParsedLine[] = [];
    for (const line of lines) {
      const parsed = parseSpecLine(line);
      if (parsed) {
        results.push(parsed);
      }
    }

    return results;
  }

  /**
   * Flush any remaining buffered content.
   * Call this when the stream ends.
   */
  flush(): ParsedLine | null {
    if (!this.buffer.trim()) return null;
    const result = parseSpecLine(this.buffer);
    this.buffer = "";
    return result;
  }
}

// ---------------------------------------------------------------------------
// Spec Patch Application
// ---------------------------------------------------------------------------

/**
 * Apply a single patch to a Spec. Returns a new Spec (immutable).
 */
export function applySpecPatch(spec: Spec, patch: SpecPatch): Spec {
  // json-render's applySpecStreamPatch mutates the target object.
  // Clone first to preserve streamui's immutable update behavior.
  const nextSpec = JSON.parse(JSON.stringify(spec)) as Spec;
  applySpecStreamPatch(
    nextSpec as unknown as Record<string, unknown>,
    patch as unknown as SpecStreamLine,
  );
  return nextSpec;
}

/**
 * Build a Spec from an array of patches.
 */
export function buildSpec(patches: SpecPatch[]): Spec {
  let spec: Spec = { root: "", elements: {} };
  let firstElementKey: string | null = null;

  for (const patch of patches) {
    const directElementPath = /^\/elements\/[^/]+$/.exec(patch.path);
    if (
      directElementPath &&
      (patch.op === "add" || patch.op === "replace") &&
      !firstElementKey
    ) {
      firstElementKey = directElementPath[0].slice("/elements/".length);
    }
    spec = applySpecPatch(spec, patch);
  }

  // Auto-infer root from first element if not set
  if (!spec.root && firstElementKey) {
    spec.root = firstElementKey;
  }

  return spec;
}
