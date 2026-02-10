import type { Spec } from "@json-render/core";

export interface UITextData {
  segmentId: string;
  text: string;
}

/**
 * UIDataTypes for useChat generic parameter.
 * Enables type-safe access to UI data in message.parts.
 */
export interface UIDataTypes {
  ui: Spec;
  "ui-text": UITextData;
  [key: string]: unknown;
}

/**
 * Patch operation types for spec updates.
 */
export type SpecPatchOperation =
  | "add"
  | "remove"
  | "replace"
  | "move"
  | "copy"
  | "test";

/**
 * A single spec patch operation.
 */
export interface SpecPatch {
  op: SpecPatchOperation;
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * Parsed SpecStream line result.
 */
export type ParsedLine =
  | { type: "patch"; data: SpecPatch }
  | { type: "text"; content: string };
