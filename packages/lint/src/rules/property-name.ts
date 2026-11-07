import type { ESTree } from "vite-plus/lint/plugins";

/**
 * The static name of a member's property, including a computed string literal
 * such as `globalThis["setTimeout"]`. Returns `undefined` for computed dynamic
 * keys and private fields.
 */
export function propertyName(node: ESTree.MemberExpression): string | undefined {
  if (node.property.type === "Identifier") return node.computed ? undefined : node.property.name;
  if (node.property.type === "Literal" && typeof node.property.value === "string") {
    return node.property.value;
  }

  return undefined;
}
