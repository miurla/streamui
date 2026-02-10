import type { ComponentRegistry } from "@json-render/react";

export const registry: ComponentRegistry = {
  Text: ({ element }) => (
    <p className="m-0 text-foreground">{element.props?.content as string}</p>
  ),

  Card: ({ element, children }) => (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {element.props?.title && (
        <h3 className="mb-2 font-semibold text-card-foreground">
          {element.props.title as string}
        </h3>
      )}
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  ),

  Stack: ({ children }) => (
    <div className="flex flex-col gap-2">{children}</div>
  ),

  Button: ({ element }) => (
    <button
      type="button"
      className="w-fit cursor-pointer rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {element.props?.label as string}
    </button>
  ),
};
