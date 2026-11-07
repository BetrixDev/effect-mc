import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";
import { propertyName } from "./property-name.ts";
import { refersToGlobal } from "./refers-to-global.ts";

/** Promise methods that begin a `.then`-style chain. */
const CHAIN_METHODS = new Set(["then", "catch", "finally"]);

/**
 * Reject raw `Promise` construction, static helpers, and `.then` chains. Fibers
 * carry interruption and the tick clock; a bare Promise does neither
 * (ADR-0018).
 */
export const noRawPromise = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject raw Promise use. Use Effect's Promise interop instead.",
    },
    messages: {
      noRawPromise:
        "`{{name}}` is a raw Promise, which the runtime cannot interrupt or drive on the tick clock. Use `Effect.promise` or `Effect.tryPromise` to enter from a Promise, and `Effect.gen` for sequencing.",
    },
  },
  create(context) {
    const report = (node: ESTree.Node, name: string) => {
      context.report({ node, messageId: "noRawPromise", data: { name } });
    };

    const isGlobalPromise = (node: ESTree.Node): boolean =>
      node.type === "Identifier" &&
      node.name === "Promise" &&
      refersToGlobal(context.sourceCode, node);

    return {
      NewExpression(node) {
        if (isGlobalPromise(node.callee)) report(node, "new Promise()");
      },
      CallExpression(node) {
        if (node.callee.type !== "MemberExpression") return;

        const method = propertyName(node.callee);
        if (method === undefined) return;

        if (isGlobalPromise(node.callee.object)) {
          report(node, `Promise.${method}()`);
          return;
        }

        if (CHAIN_METHODS.has(method)) report(node, `.${method}()`);
      },
    };
  },
});
