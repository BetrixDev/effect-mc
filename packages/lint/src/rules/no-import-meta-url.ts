import { defineRule } from "vite-plus/lint/plugins";
import { propertyName } from "./property-name.ts";

/**
 * Reject `import.meta.url`. The host evaluates a container's module source
 * directly, so there is no module URL to resolve assets against (ADR-0018).
 */
export const noImportMetaUrl = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject import.meta.url. Use a static import for bundled data.",
    },
    messages: {
      noImportMetaUrl:
        "`import.meta.url` does not exist in the plugin runtime because the host evaluates the container's module source directly. Use a static `import` for bundled data instead.",
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (propertyName(node) !== "url") return;
        if (node.object.type !== "MetaProperty") return;
        if (node.object.meta.name !== "import" || node.object.property.name !== "meta") return;

        context.report({ node, messageId: "noImportMetaUrl" });
      },
    };
  },
});
