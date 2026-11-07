import { defineRule } from "vite-plus/lint/plugins";
import { refersToGlobal } from "./refers-to-global.ts";

/**
 * Reject CommonJS `require`. A container is one bundled ES module, so a
 * dependency must be a static `import` for the bundler to include it
 * (ADR-0018).
 */
export const noRequire = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject CommonJS require. Use a static import instead.",
    },
    messages: {
      noRequire:
        "`require` does not exist in the plugin runtime. Use a static `import` so the bundler includes the dependency in `plugin.mjs`.",
    },
  },
  create(context) {
    return {
      Identifier(node) {
        if (node.name !== "require") return;
        if (!refersToGlobal(context.sourceCode, node)) return;

        context.report({ node, messageId: "noRequire" });
      },
    };
  },
});
