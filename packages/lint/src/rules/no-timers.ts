import { defineRule } from "vite-plus/lint/plugins";
import type { ESTree } from "vite-plus/lint/plugins";
import { propertyName } from "./property-name.ts";
import { refersToGlobal } from "./refers-to-global.ts";

/** Timer names the plugin runtime does not provide. */
const TIMERS = new Set(["setTimeout", "setInterval", "setImmediate"]);

/** Hosts whose timer members resolve to the missing globals. */
const HOSTS = new Set(["globalThis", "window", "self", "global"]);

/**
 * Reject `setTimeout`, `setInterval`, and `setImmediate`. Plugin time is driven
 * by the host's tick clock, so a host timer would keep running while the server
 * is paused and would escape teardown (ADR-0018).
 */
export const noTimers = defineRule({
  meta: {
    type: "problem",
    docs: {
      description: "Reject host timers. Use Effect sleep, schedules, or Tasks.attach instead.",
    },
    messages: {
      noTimers:
        "`{{name}}` does not exist in the plugin runtime. Use `Effect.sleep` for a delay, `Effect.repeat` with a `Schedule` for recurring work, or `Tasks.attach` for a registration that teardown removes.",
    },
  },
  create(context) {
    const report = (node: ESTree.Node, name: string) => {
      context.report({ node, messageId: "noTimers", data: { name } });
    };

    return {
      Identifier(node) {
        if (!TIMERS.has(node.name)) return;
        if (refersToGlobal(context.sourceCode, node)) report(node, node.name);
      },
      MemberExpression(node) {
        const name = propertyName(node);
        if (name === undefined || !TIMERS.has(name)) return;
        if (node.object.type !== "Identifier" || !HOSTS.has(node.object.name)) return;
        if (!refersToGlobal(context.sourceCode, node.object)) return;

        report(node.property, name);
      },
    };
  },
});
