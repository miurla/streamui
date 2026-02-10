// Transport
export { UITransport } from "./transport";
export type { UITransportOptions } from "./transport";

// Types for useChat generic
export type { UIDataTypes } from "./types";

// Utilities
export { convertUIMessagesToModelMessages } from "./utils";

// Schema / Catalog
export { defaultSchema, createCatalog, createUserPrompt } from "./schema";
export { defineSchema } from "@json-render/core";
export type { Catalog, Schema } from "@json-render/core";

// Re-export Spec for convenience
export type { Spec } from "@json-render/core";
