import { defineRule } from "vite-plus/lint/plugins";

/**
 * Reject dynamic `import()`. The container is one bundled module with no
 * externals, so a lazily imported module would not be in the artifact
 * (ADR-0018).
 */
export const noDynamicImport = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject dynamic import. Use a static import instead.",
    },
    messages: {
      noDynamicImport:
        "A dynamic `import()` is not available in the plugin runtime, and the bundler cannot put its target in `plugin.mjs`. Use a static `import` instead.",
    },
  },
  create(context) {
    return {
      ImportExpression(node) {
        context.report({ node, messageId: "noDynamicImport" });
      },
    };
  },
});
