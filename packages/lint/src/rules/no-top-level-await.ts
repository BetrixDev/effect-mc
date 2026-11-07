import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";

/** Nodes that own an `await` and make it non-top-level. */
const ASYNC_BOUNDARIES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/**
 * Reject `await` outside a function. A plugin module's default export is a
 * finite `Effect`, not a module with an asynchronous evaluation phase
 * (ADR-0018).
 */
export const noTopLevelAwait = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject top-level await. Put the work in the plugin's Effect program.",
    },
    messages: {
      noTopLevelAwait:
        "A plugin module has no asynchronous evaluation phase, so top-level `await` cannot run. Use `Effect.gen(function* () { ... })` and `yield*` the effect inside the plugin program instead.",
    },
  },
  create(context) {
    const isTopLevel = (node: ESTree.Node): boolean => {
      let current: ESTree.Node | null = node.parent;

      while (current !== null) {
        if (ASYNC_BOUNDARIES.has(current.type)) return false;
        current = current.parent;
      }

      return true;
    };

    return {
      AwaitExpression(node) {
        if (isTopLevel(node)) context.report({ node, messageId: "noTopLevelAwait" });
      },
      ForOfStatement(node) {
        if (node.await === true && isTopLevel(node)) {
          context.report({ node, messageId: "noTopLevelAwait" });
        }
      },
    };
  },
});
